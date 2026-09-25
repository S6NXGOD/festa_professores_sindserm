import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliationForm, person, registration } from "@/server/db/schema";
import {
  type AffiliationFormInput,
  affiliationFormSchema,
  type DeclaredMemberInput,
  declaredMemberSchema,
  registrationNumberKey,
} from "@/domain/schemas";
import { DOCUMENT_KIND_LABEL } from "@/domain/labels";
import { isActiveMember } from "@/domain/rules";
import { authorizationText } from "@/domain/affiliation-text";
import { generateToken, sha256Hex } from "@/server/crypto";
import { type Actor, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { convertActiveGuestLink } from "./conversion";
import { linkDocumentsToForm, missingDocuments } from "./documents";
import { DomainError, isUniqueViolation } from "./errors";
import { lockRegistration } from "./locks";
import { personSearchFields } from "./registration";
import { findRegistrationIdByMember, isActiveEmployee } from "./state";
import { withTx } from "./tx";
import { ensureActiveVoucher } from "./vouchers";

const MATRICULA_TAKEN = "Matrícula já cadastrada para outra pessoa.";

async function lockPerson(tx: Tx, personId: string) {
  const [row] = await tx.select().from(person).where(eq(person.id, personId)).for("update");
  if (!row) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
  return row;
}

/** Matrícula é chave única: não pode pertencer a outra pessoa. */
async function assertMatriculaFree(tx: Tx, value: string, ownerPersonId: string | null, field = "registrationNumber") {
  const key = registrationNumberKey(value);
  if (!key) return;
  const [other] = await tx
    .select({ id: person.id })
    .from(person)
    .where(
      ownerPersonId
        ? and(eq(person.registrationNumberKey, key), ne(person.id, ownerPersonId))
        : eq(person.registrationNumberKey, key),
    )
    .limit(1);
  if (other) throw new DomainError("CONFLICT", MATRICULA_TAKEN, { [field]: MATRICULA_TAKEN });
}

/**
 * Convidado cadastrado sem CPF que passa a ser filiado(a): o CPF passa a ser
 * obrigatório e não pode pertencer a outra pessoa.
 */
async function completeMissingCpf(tx: Tx, target: { id: string; cpf: string | null }, cpf: string | null | undefined, field = "cpf") {
  if (target.cpf) return;
  if (!cpf) throw new DomainError("VALIDATION", "Informe o CPF: ele é obrigatório para filiados.", { [field]: "Informe o CPF" });
  const [other] = await tx.select({ id: person.id }).from(person).where(eq(person.cpf, cpf)).limit(1);
  if (other) {
    throw new DomainError("CPF_TAKEN", "Este CPF já pertence a outra pessoa cadastrada.", { [field]: "CPF de outra pessoa" });
  }
  await tx.update(person).set({ cpf }).where(eq(person.id, target.id));
}

function mapPersonUniqueViolation(error: unknown) {
  if (isUniqueViolation(error, "person_registration_number_unique")) {
    return new DomainError("CONFLICT", MATRICULA_TAKEN, { registrationNumber: MATRICULA_TAKEN });
  }
  if (isUniqueViolation(error, "person_cpf_unique")) {
    return new DomainError("CPF_TAKEN", "Este CPF acabou de ser cadastrado. Busque a pessoa e abra a ficha pelo cadastro dela.");
  }
  if (isUniqueViolation(error, "affiliation_form_one_open_per_person")) {
    return new DomainError("CONFLICT", "Já existe uma ficha em andamento para esta pessoa.");
  }
  return null;
}

/**
 * Pessoa cadastrada como convidada que declara já ser filiada: cria a inscrição
 * como PENDING. Ela continua convidada até a conferência; se a filiação for
 * confirmada, aplica-se a regra do convidado que vira filiado (decideAffiliation).
 */
export async function registerDeclaredMember(actor: Actor, rawInput: DeclaredMemberInput) {
  assertPermission(actor, "registerAtEvent");
  const input = declaredMemberSchema.parse(rawInput);
  try {
    return await withTx(async (tx) => {
      const target = await lockPerson(tx, input.personId);
      if (await findRegistrationIdByMember(tx, target.id)) {
        throw new DomainError("CONFLICT", "Esta pessoa já possui inscrição como filiada.");
      }
      await assertMatriculaFree(tx, input.registrationNumber, target.id);
      await completeMissingCpf(tx, target, input.cpf);
      await tx
        .update(person)
        .set({ whatsapp: input.whatsapp, registrationNumber: input.registrationNumber, workplace: input.workplace })
        .where(eq(person.id, target.id));
      const accessToken = generateToken();
      const [reg] = await tx
        .insert(registration)
        .values({
          memberPersonId: target.id,
          status: "PENDING",
          isTeacher: input.isTeacher,
          origin: "GUEST_CONVERSION",
          accessTokenHash: sha256Hex(accessToken),
          createdByUserId: actor.userId,
        })
        .returning({ id: registration.id });
      await ensureActiveVoucher(tx, target.id, actor.userId);
      await writeAudit(tx, actor, {
        action: "DECLARED_MEMBER_REGISTERED",
        entityType: "registration",
        entityId: reg!.id,
        summary: `${target.fullName} cadastrado(a) como filiado(a)${input.isTeacher ? " (professor(a))" : ""}, aguardando conferência.`,
      });
      return { registrationId: reg!.id, accessToken };
    });
  } catch (error) {
    throw mapPersonUniqueViolation(error) ?? error;
  }
}

// ---------------------------------------------------------------------------
// Ficha de filiação
// ---------------------------------------------------------------------------

function formValues(data: ReturnType<typeof affiliationFormSchema.parse>) {
  return {
    formDate: data.formDate,
    isTeacher: data.isTeacher,
    fullName: data.fullName,
    motherName: data.motherName,
    fatherName: data.fatherName,
    address: data.address,
    addressNumber: data.addressNumber,
    neighborhood: data.neighborhood,
    email: data.email,
    whatsapp: data.whatsapp,
    birthDate: data.birthDate,
    rg: data.rg,
    cpf: data.cpf,
    workplace: data.workplace,
    registrationNumber: data.registrationNumber,
    jobTitle: data.jobTitle,
    admissionDate: data.admissionDate,
    contributionStartMonth: data.contributionStartMonth,
    authorizationText: authorizationText(data.contributionStartMonth),
  };
}

/**
 * Salva (cria ou atualiza) a ficha de filiação como rascunho. Também serve para
 * revisar, na recepção, a ficha preenchida antes da festa pelo(a) interessado(a).
 */
export async function saveAffiliationForm(actor: Actor, rawInput: AffiliationFormInput, formId?: string | null) {
  assertPermission(actor, "newAffiliation");
  const data = affiliationFormSchema.parse(rawInput);
  try {
    return await withTx(async (tx) => {
      if (formId) {
        const [form] = await tx.select().from(affiliationForm).where(eq(affiliationForm.id, formId)).for("update");
        if (!form) throw new DomainError("NOT_FOUND", "Ficha não encontrada.");
        if (form.status !== "DRAFT") throw new DomainError("INVALID_STATE", "Somente fichas em rascunho podem ser editadas.");
        if (form.cpf !== data.cpf) {
          throw new DomainError("VALIDATION", "O CPF da ficha não pode ser alterado.", { cpf: "CPF não pode ser alterado" });
        }
        await assertMatriculaFree(tx, data.registrationNumber, form.personId);
        await tx.update(affiliationForm).set(formValues(data)).where(eq(affiliationForm.id, form.id));
        // Ficha antecipada: a inscrição acompanha a resposta "é professor(a)?".
        if (form.registrationId && form.isTeacher !== data.isTeacher) {
          const state = await lockRegistration(tx, form.registrationId);
          if (!data.isTeacher && state.guest) {
            throw new DomainError("INVALID_STATE", "Remova o convidado antes: somente professoras e professores levam convidado.", {
              isTeacher: "Há convidado cadastrado",
            });
          }
          await tx.update(registration).set({ isTeacher: data.isTeacher }).where(eq(registration.id, state.id));
        }
        if (data.documents) await linkDocumentsToForm(tx, form.id, data.documents);
        await writeAudit(tx, actor, {
          action: "AFFILIATION_FORM_SAVED",
          entityType: "affiliation_form",
          entityId: form.id,
          summary: `Ficha de filiação de ${data.fullName} atualizada.`,
        });
        return { formId: form.id, personId: form.personId };
      }

      let personId: string;
      if (data.personId) {
        const target = await lockPerson(tx, data.personId);
        // Convidado sem CPF: a ficha completa o cadastro.
        await completeMissingCpf(tx, target, data.cpf);
        if (target.cpf && target.cpf !== data.cpf) {
          throw new DomainError("VALIDATION", "O CPF informado é diferente do cadastro da pessoa.", {
            cpf: "CPF diferente do cadastro",
          });
        }
        personId = target.id;
      } else {
        const [existing] = await tx.select({ id: person.id }).from(person).where(eq(person.cpf, data.cpf)).for("update");
        if (existing) {
          personId = existing.id;
        } else {
          await assertMatriculaFree(tx, data.registrationNumber, null);
          const [created] = await tx
            .insert(person)
            .values({
              ...personSearchFields(data.fullName),
              cpf: data.cpf,
              whatsapp: data.whatsapp,
              registrationNumber: data.registrationNumber,
              workplace: data.workplace,
            })
            .returning({ id: person.id });
          personId = created!.id;
        }
      }
      await assertMatriculaFree(tx, data.registrationNumber, personId);
      if (await isActiveEmployee(tx, personId)) {
        throw new DomainError("CONFLICT", "Esta pessoa está na lista de funcionários do SINDSERM. Tire da lista antes de fazer a ficha.", {
          cpf: "Funcionário(a) do SINDSERM",
        });
      }

      const own = await findRegistrationIdByMember(tx, personId);
      if (own && isActiveMember(own.status)) {
        throw new DomainError("CONFLICT", "Esta pessoa já é filiada confirmada.", { cpf: "Já é filiado(a)" });
      }
      const [open] = await tx
        .select({ id: affiliationForm.id })
        .from(affiliationForm)
        .where(and(eq(affiliationForm.personId, personId), inArray(affiliationForm.status, ["DRAFT", "FORMALIZED"])))
        .limit(1);
      if (open) {
        throw new DomainError("CONFLICT", "Já existe uma ficha em andamento para esta pessoa.", {
          cpf: "Ficha já existente",
        });
      }

      const [created] = await tx
        .insert(affiliationForm)
        .values({
          personId,
          status: "DRAFT",
          origin: "STAFF",
          ...formValues(data),
          authorizationAccepted: true,
          authorizationAcceptedAt: new Date(),
          createdByUserId: actor.userId,
          // Ficha de quem já tem inscrição (ex.: aguardando assinatura) fica ligada a ela.
          registrationId: own?.status === "AWAITING_SIGNATURE" ? own.id : null,
        })
        .returning({ id: affiliationForm.id });
      if (data.documents) await linkDocumentsToForm(tx, created!.id, data.documents);
      await writeAudit(tx, actor, {
        action: "AFFILIATION_FORM_SAVED",
        entityType: "affiliation_form",
        entityId: created!.id,
        summary: `Ficha de filiação de ${data.fullName} registrada (aguardando assinatura).`,
      });
      return { formId: created!.id, personId };
    });
  } catch (error) {
    throw mapPersonUniqueViolation(error) ?? error;
  }
}

/**
 * Registra que a ficha foi assinada na recepção. A pessoa passa a
 * JOINED_AT_EVENT com os direitos de filiado(a) (kit e convidado se for
 * professor(a)).
 */
export async function formalizeAffiliation(actor: Actor, formId: string) {
  assertPermission(actor, "newAffiliation");
  try {
    return await withTx(async (tx) => {
      const [form] = await tx.select().from(affiliationForm).where(eq(affiliationForm.id, formId)).for("update");
      if (!form) throw new DomainError("NOT_FOUND", "Ficha não encontrada.");
      if (form.status !== "DRAFT") throw new DomainError("INVALID_STATE", "Esta ficha não está aguardando assinatura.");
      // A filiação só é confirmada com a cópia do RG e do contracheque anexadas.
      const missing = await missingDocuments(tx, form.id);
      if (missing.length) {
        throw new DomainError(
          "INVALID_STATE",
          `Faltam documentos: ${missing.map((kind) => DOCUMENT_KIND_LABEL[kind]).join(" e ")}. Anexe na ficha antes de confirmar a assinatura.`,
        );
      }

      // Ordem de bloqueio: inscrição antes da pessoa.
      const own = await findRegistrationIdByMember(tx, form.personId);
      if (own) {
        if (isActiveMember(own.status)) throw new DomainError("CONFLICT", "Esta pessoa já é filiada confirmada.");
        const state = await lockRegistration(tx, own.id);
        if (!form.isTeacher && state.guest) {
          throw new DomainError("INVALID_STATE", "A ficha indica que a pessoa não é professor(a), mas há convidado cadastrado. Remova o convidado ou corrija a ficha.");
        }
      }
      const target = await lockPerson(tx, form.personId);
      await assertMatriculaFree(tx, form.registrationNumber, target.id);
      // Convidado cadastrado sem CPF: o CPF da ficha passa a valer no cadastro.
      await completeMissingCpf(tx, target, form.cpf);
      await tx
        .update(person)
        .set({
          ...personSearchFields(form.fullName),
          whatsapp: form.whatsapp,
          registrationNumber: form.registrationNumber,
          workplace: form.workplace,
        })
        .where(eq(person.id, target.id));

      const now = new Date();
      const statusFields = {
        status: "JOINED_AT_EVENT" as const,
        isTeacher: form.isTeacher,
        statusChangedAt: now,
        statusChangedByUserId: actor.userId,
        statusNote: "Ficha de filiação assinada na festa",
      };
      let registrationId: string;
      let accessToken: string | null = null;
      let previousStatus: string | null = null;
      if (own) {
        previousStatus = own.status;
        await tx.update(registration).set(statusFields).where(eq(registration.id, own.id));
        registrationId = own.id;
      } else {
        accessToken = generateToken();
        const [reg] = await tx
          .insert(registration)
          .values({
            memberPersonId: target.id,
            origin: "NEW_AFFILIATION",
            accessTokenHash: sha256Hex(accessToken),
            createdByUserId: actor.userId,
            ...statusFields,
          })
          .returning({ id: registration.id });
        registrationId = reg!.id;
      }

      const conversion = await convertActiveGuestLink(tx, actor, target.id, registrationId);
      await ensureActiveVoucher(tx, target.id, actor.userId);
      await tx
        .update(affiliationForm)
        .set({ status: "FORMALIZED", formalizedAt: now, formalizedByUserId: actor.userId, registrationId })
        .where(eq(affiliationForm.id, form.id));

      await writeAudit(tx, actor, {
        action: "AFFILIATION_FORMALIZED",
        entityType: "registration",
        entityId: registrationId,
        summary: `Ficha de filiação de ${form.fullName} assinada na festa.`,
        before: { status: previousStatus },
        after: { status: "JOINED_AT_EVENT", formId: form.id, isTeacher: form.isTeacher, conversion },
      });
      return { registrationId, personId: target.id, accessToken, conversion };
    });
  } catch (error) {
    throw mapPersonUniqueViolation(error) ?? error;
  }
}

/**
 * Cancela a ficha (ex.: a pessoa desistiu de assinar). Se a ficha foi
 * preenchida antes da festa, a inscrição dela deixa de valer como filiação.
 */
export async function cancelAffiliationForm(actor: Actor, formId: string) {
  assertPermission(actor, "newAffiliation");
  return withTx(async (tx) => {
    const [form] = await tx.select().from(affiliationForm).where(eq(affiliationForm.id, formId)).for("update");
    if (!form) throw new DomainError("NOT_FOUND", "Ficha não encontrada.");
    if (form.status !== "DRAFT") throw new DomainError("INVALID_STATE", "Somente fichas em rascunho podem ser canceladas.");
    await tx
      .update(affiliationForm)
      .set({ status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: actor.userId })
      .where(eq(affiliationForm.id, form.id));
    if (form.registrationId) {
      const state = await lockRegistration(tx, form.registrationId);
      if (state.status === "AWAITING_SIGNATURE") {
        await tx
          .update(registration)
          .set({
            status: "REJECTED",
            statusChangedAt: new Date(),
            statusChangedByUserId: actor.userId,
            statusNote: "Ficha de filiação não assinada",
          })
          .where(eq(registration.id, state.id));
      }
    }
    await writeAudit(tx, actor, {
      action: "AFFILIATION_FORM_CANCELLED",
      entityType: "affiliation_form",
      entityId: form.id,
      summary: `Ficha de filiação de ${form.fullName} cancelada.`,
    });
  });
}
