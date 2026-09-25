import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Executor, Tx } from "@/server/db";
import { affiliationForm, guestLink, person, registration } from "@/server/db/schema";
import { authorizationText } from "@/domain/affiliation-text";
import {
  type PreAffiliationInput,
  preAffiliationSchema,
  type RegistrationInput,
  registrationNumberKey,
  registrationSchema,
} from "@/domain/schemas";
import { maskCpf } from "@/lib/cpf";
import { todayInZone } from "@/lib/datetime";
import { toSearchText } from "@/lib/text";
import { generateToken, isWellFormedToken, sha256Hex } from "@/server/crypto";
import { type Actor, actorUserId, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { linkDocumentsToForm } from "./documents";
import { DomainError, isUniqueViolation } from "./errors";
import { getEventConfig, registrationWindow } from "./settings";
import { withTx } from "./tx";
import { issueVoucher } from "./vouchers";

export interface CreatedRegistration {
  registrationId: string;
  /** Token do link de acesso aos vouchers do grupo (exibido só agora). */
  accessToken: string;
  reused: boolean;
}

export function personSearchFields(fullName: string) {
  return { fullName, searchName: toSearchText(fullName) };
}

/** Gera novo link de acesso aos vouchers do grupo, invalidando o anterior. */
export async function rotateAccessToken(tx: Tx, registrationId: string) {
  const accessToken = generateToken();
  await tx
    .update(registration)
    .set({ accessTokenHash: sha256Hex(accessToken) })
    .where(eq(registration.id, registrationId));
  return accessToken;
}

const TAKEN_MESSAGE = "CPF já cadastrado na festa. Se não foi você, fale com a organização pelo WhatsApp (botão verde).";
const MATRICULA_TAKEN_MESSAGE = "Matrícula já cadastrada para outra pessoa. Confira o número ou fale com a organização pelo WhatsApp.";

/** CPF e matrícula da prefeitura são chaves únicas. */
async function assertIdentifiersAvailable(
  ex: Executor,
  cpfs: { cpf: string; field: string }[],
  matricula: { value: string; field: string },
) {
  const fieldErrors: Record<string, string> = {};
  const existing = cpfs.length
    ? await ex
        .select({ cpf: person.cpf })
        .from(person)
        .where(
          inArray(
            person.cpf,
            cpfs.map((c) => c.cpf),
          ),
        )
    : [];
  const taken = new Set(existing.map((e) => e.cpf));
  for (const { cpf, field } of cpfs) {
    if (taken.has(cpf)) fieldErrors[field] = TAKEN_MESSAGE;
  }
  const key = registrationNumberKey(matricula.value);
  if (key) {
    const [owner] = await ex
      .select({ id: person.id })
      .from(person)
      .where(eq(person.registrationNumberKey, key))
      .limit(1);
    if (owner) fieldErrors[matricula.field] = MATRICULA_TAKEN_MESSAGE;
  }
  if (Object.keys(fieldErrors).length) {
    throw new DomainError("CPF_TAKEN", "Há dados já cadastrados. Revise os campos destacados.", fieldErrors);
  }
}

function mapUniqueViolation(error: unknown): never {
  if (isUniqueViolation(error, "person_cpf_unique")) throw new DomainError("CPF_TAKEN", TAKEN_MESSAGE);
  if (isUniqueViolation(error, "person_registration_number_unique")) {
    throw new DomainError("CPF_TAKEN", MATRICULA_TAKEN_MESSAGE);
  }
  throw error;
}

async function assertPublicWindowOpen(tx: Tx, actor: Actor, now: Date) {
  if (actor.kind !== "public") return;
  // Formulário público só funciona com o setup concluído e dentro do período.
  const window = registrationWindow(await getEventConfig(tx), now);
  if (window.state !== "OPEN") {
    throw new DomainError("REGISTRATION_CLOSED", "As inscrições não estão abertas no momento.");
  }
}

/** Reenvio do mesmo formulário (ex.: rede instável): devolve a inscrição já criada. */
async function findPreviousSubmission(tx: Tx, submissionId: string) {
  const [previous] = await tx
    .select({ id: registration.id })
    .from(registration)
    .where(eq(registration.submissionId, submissionId))
    .for("update");
  if (!previous) return null;
  return { registrationId: previous.id, accessToken: await rotateAccessToken(tx, previous.id), reused: true };
}

/** CPFs a conferir: o do(a) filiado(a) e, se informado, o do convidado. */
function identifierCpfs(memberCpf: string, memberField: string, guest: { cpf: string | null } | null) {
  return [{ cpf: memberCpf, field: memberField }, ...(guest?.cpf ? [{ cpf: guest.cpf, field: "guest.cpf" }] : [])];
}

function guestAudit(guest: { fullName: string; cpf: string | null } | null) {
  return guest ? { fullName: guest.fullName, cpf: guest.cpf ? maskCpf(guest.cpf) : "não informado" } : null;
}

async function insertGuest(
  tx: Tx,
  registrationId: string,
  guest: { fullName: string; cpf: string | null; isMinor: boolean },
  createdBy: string | null,
) {
  const [guestPerson] = await tx
    .insert(person)
    .values({ ...personSearchFields(guest.fullName), cpf: guest.cpf, isMinor: guest.isMinor })
    .returning({ id: person.id });
  await tx.insert(guestLink).values({ registrationId, guestPersonId: guestPerson!.id, addedByUserId: createdBy });
  await issueVoucher(tx, guestPerson!.id, createdBy);
}

/**
 * Inscrição de quem declara já ser filiado(a) (formulário público ou
 * Atendimento): pessoa, inscrição PENDENTE de conferência, convidado opcional
 * (só professoras e professores) e vouchers individuais.
 */
export async function createRegistration(actor: Actor, rawInput: RegistrationInput, now = new Date()) {
  const input = registrationSchema.parse(rawInput);
  const origin = actor.kind === "public" ? "PUBLIC_FORM" : "STAFF";
  if (actor.kind === "staff") assertPermission(actor, "registerAtEvent");

  try {
    return await withTx(async (tx): Promise<CreatedRegistration> => {
      await assertPublicWindowOpen(tx, actor, now);
      const previous = await findPreviousSubmission(tx, input.submissionId);
      if (previous) return previous;

      await assertIdentifiersAvailable(
        tx,
        identifierCpfs(input.member.cpf, "member.cpf", input.guest),
        { value: input.member.registrationNumber, field: "member.registrationNumber" },
      );

      const createdBy = actorUserId(actor);
      const [member] = await tx
        .insert(person)
        .values({
          ...personSearchFields(input.member.fullName),
          cpf: input.member.cpf,
          whatsapp: input.member.whatsapp,
          registrationNumber: input.member.registrationNumber,
          workplace: input.member.workplace,
        })
        .returning({ id: person.id });

      const accessToken = generateToken();
      const [reg] = await tx
        .insert(registration)
        .values({
          memberPersonId: member!.id,
          status: "PENDING",
          isTeacher: input.isTeacher,
          origin,
          accessTokenHash: sha256Hex(accessToken),
          submissionId: input.submissionId,
          createdByUserId: createdBy,
        })
        .returning({ id: registration.id });

      await issueVoucher(tx, member!.id, createdBy);
      if (input.guest) await insertGuest(tx, reg!.id, input.guest, createdBy);

      await writeAudit(tx, actor, {
        action: "REGISTRATION_CREATED",
        entityType: "registration",
        entityId: reg!.id,
        summary: `Inscrição de ${input.member.fullName}${input.isTeacher ? " (professor(a))" : " (não professor(a))"}${input.guest ? ` com convidado(a) ${input.guest.fullName}` : ""}.`,
        after: {
          member: { fullName: input.member.fullName, cpf: maskCpf(input.member.cpf) },
          isTeacher: input.isTeacher,
          guest: guestAudit(input.guest),
          origin,
        },
      });

      return { registrationId: reg!.id, accessToken, reused: false };
    });
  } catch (error) {
    mapUniqueViolation(error);
  }
}

/**
 * Quem ainda não é filiado(a) preenche a ficha de filiação antes da festa. A
 * inscrição fica "aguardando assinatura": na recepção, o Atendimento imprime a
 * ficha, colhe a assinatura da autorização de desconto e confirma.
 */
export async function createPreAffiliation(actor: Actor, rawInput: PreAffiliationInput, now = new Date()) {
  const input = preAffiliationSchema.parse(rawInput);
  if (actor.kind === "staff") assertPermission(actor, "newAffiliation");
  const ficha = input.ficha;

  try {
    return await withTx(async (tx): Promise<CreatedRegistration> => {
      await assertPublicWindowOpen(tx, actor, now);
      const previous = await findPreviousSubmission(tx, input.submissionId);
      if (previous) return previous;

      await assertIdentifiersAvailable(
        tx,
        identifierCpfs(ficha.cpf, "ficha.cpf", input.guest),
        { value: ficha.registrationNumber, field: "ficha.registrationNumber" },
      );

      const createdBy = actorUserId(actor);
      const [member] = await tx
        .insert(person)
        .values({
          ...personSearchFields(ficha.fullName),
          cpf: ficha.cpf,
          whatsapp: ficha.whatsapp,
          registrationNumber: ficha.registrationNumber,
          workplace: ficha.workplace,
        })
        .returning({ id: person.id });

      const accessToken = generateToken();
      const [reg] = await tx
        .insert(registration)
        .values({
          memberPersonId: member!.id,
          status: "AWAITING_SIGNATURE",
          isTeacher: input.isTeacher,
          origin: "PRE_AFFILIATION",
          accessTokenHash: sha256Hex(accessToken),
          submissionId: input.submissionId,
          createdByUserId: createdBy,
        })
        .returning({ id: registration.id });

      const [form] = await tx
        .insert(affiliationForm)
        .values({
          personId: member!.id,
          status: "DRAFT",
          origin: actor.kind === "public" ? "PUBLIC" : "STAFF",
          isTeacher: input.isTeacher,
          formDate: todayInZone(),
          ...ficha,
          authorizationAccepted: true,
          authorizationText: authorizationText(ficha.contributionStartMonth),
          authorizationAcceptedAt: now,
          createdByUserId: createdBy,
          registrationId: reg!.id,
        })
        .returning({ id: affiliationForm.id });
      // RG e contracheque enviados pelo formulário passam a fazer parte da ficha.
      await linkDocumentsToForm(tx, form!.id, input.documents);

      await issueVoucher(tx, member!.id, createdBy);
      if (input.guest) await insertGuest(tx, reg!.id, input.guest, createdBy);

      await writeAudit(tx, actor, {
        action: "PRE_AFFILIATION_CREATED",
        entityType: "registration",
        entityId: reg!.id,
        summary: `${ficha.fullName} preencheu a ficha de filiação${input.guest ? ` e cadastrou ${input.guest.fullName} como convidado(a)` : ""}; falta assinar na recepção.`,
        after: {
          formId: form!.id,
          member: { fullName: ficha.fullName, cpf: maskCpf(ficha.cpf) },
          isTeacher: input.isTeacher,
          guest: guestAudit(input.guest),
          documents: { rg: input.documents.rg.length, payslip: input.documents.payslip.length },
        },
      });

      return { registrationId: reg!.id, accessToken, reused: false };
    });
  } catch (error) {
    mapUniqueViolation(error);
  }
}

/** Renova o link de vouchers de um grupo (ex.: filiado perdeu o link). */
export async function renewRegistrationAccess(actor: Actor, registrationId: string) {
  assertPermission(actor, "reissueVoucher");
  return withTx(async (tx) => {
    const [reg] = await tx
      .select({ id: registration.id })
      .from(registration)
      .where(eq(registration.id, registrationId))
      .for("update");
    if (!reg) throw new DomainError("NOT_FOUND", "Inscrição não encontrada.");
    const accessToken = await rotateAccessToken(tx, reg.id);
    await writeAudit(tx, actor, {
      action: "REGISTRATION_ACCESS_RENEWED",
      entityType: "registration",
      entityId: reg.id,
      summary: "Novo link de vouchers gerado; o link anterior deixou de funcionar.",
    });
    return { accessToken };
  });
}

export async function findRegistrationByAccessToken(ex: Executor, accessToken: string) {
  if (!isWellFormedToken(accessToken)) return null;
  const [row] = await ex
    .select({ id: registration.id })
    .from(registration)
    .where(eq(registration.accessTokenHash, sha256Hex(accessToken)))
    .limit(1);
  return row ?? null;
}
