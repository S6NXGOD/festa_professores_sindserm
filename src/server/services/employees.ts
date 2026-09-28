import "server-only";
import { and, asc, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import type { Executor, Tx } from "@/server/db";
import { checkIn, employee, guestLink, kitDelivery, person } from "@/server/db/schema";
import {
  type BulkEmployeesInput,
  bulkEmployeesSchema,
  type CompanionInput,
  companionSchema,
  COURTESY_NO_GUEST_MESSAGE,
  type EmployeeData,
  type EmployeeInput,
  employeeSchema,
  parseEmployeeLines,
  type UpdateEmployeeInput,
  updateEmployeeSchema,
} from "@/domain/schemas";
import { EMPLOYEE_CATEGORY_INLINE, EMPLOYEE_CATEGORY_LABEL } from "@/domain/labels";
import type { EmployeeCategory } from "@/domain/types";
import { maskCpf } from "@/lib/cpf";
import { plural } from "@/lib/plural";
import { toSearchText } from "@/lib/text";
import { can } from "@/domain/access";
import { type Actor, assertPermission, type StaffActor } from "./actor";
import { writeAudit } from "./audit";
import { DomainError, isUniqueViolation } from "./errors";
import { attachGuest, endGuestLink, type GuestHost, hostFromEmployee, mapGuestError } from "./group";
import { lockEmployeeGroup, lockEmployeeGroupWithPeople } from "./locks";
import { personSearchFields } from "./registration";
import { findActiveGuestLink, findRegistrationIdByMember } from "./state";
import { withTx } from "./tx";
import { ensureActiveVoucher, revokeActiveVoucher } from "./vouchers";

/*
 * Colaboradores do SINDSERM liberados para a festa — diretoria, funcionários e
 * prestadores de serviço: cadastro só interno, voucher próprio, 1 kit do
 * estoque dos colaboradores e 1 convidado (com kit do mesmo estoque, depois
 * que o(a) colaborador(a) chegar).
 *
 * Cortesias da organização (amigos, familiares, autoridades) usam o mesmo
 * cadastro com a categoria COURTESY: voucher próprio e 1 kit do estoque dos
 * colaboradores, que sai na entrada da própria pessoa. Não levam convidado:
 * cada pessoa convidada é uma cortesia.
 */

/** "da lista de colaboradores" / "da lista de cortesias". */
function listName(category: EmployeeCategory) {
  return category === "COURTESY" ? "cortesias" : "colaboradores";
}

function mapEmployeeError(error: unknown): never {
  if (isUniqueViolation(error, "person_cpf_unique")) {
    throw new DomainError("CPF_TAKEN", "Este CPF acabou de ser cadastrado. Tente de novo.", { cpf: "CPF já cadastrado" });
  }
  if (isUniqueViolation(error, "employee_person_unique")) {
    throw new DomainError("CONFLICT", "Esta pessoa já está na lista de colaboradores.", { cpf: "Já está na lista" });
  }
  mapGuestError(error);
}

/** Quem é filiado(a) ou convidado(a) não entra também como funcionário(a): um voucher por pessoa. */
async function assertNotParticipant(tx: Tx, personId: string) {
  const own = await findRegistrationIdByMember(tx, personId);
  if (own && own.status !== "REJECTED") {
    throw new DomainError("CONFLICT", "Esta pessoa está inscrita na festa como filiado(a).", { cpf: "Inscrita como filiado(a)" });
  }
  if (await findActiveGuestLink(tx, personId)) {
    throw new DomainError("CONFLICT", "Esta pessoa está inscrita na festa como convidado(a).", { cpf: "Inscrita como convidado(a)" });
  }
}

type EmployeeFields = Omit<EmployeeData, "guest"> & { hostEmployeeId?: string | null };

/** Colaborador(a) sempre tem kit e não é "trazido(a)" por ninguém: só cortesia usa esses campos. */
function courtesyFields(input: EmployeeFields) {
  const courtesy = input.category === "COURTESY";
  return { withKit: courtesy ? input.withKit : true, hostEmployeeId: courtesy ? (input.hostEmployeeId ?? null) : null };
}

async function insertEmployee(tx: Tx, actor: StaffActor, input: EmployeeFields) {
  let personId: string | null = null;
  let restoredId: string | null = null;
  if (input.cpf) {
    const [existing] = await tx.select({ id: person.id }).from(person).where(eq(person.cpf, input.cpf)).for("update");
    if (existing) {
      await assertNotParticipant(tx, existing.id);
      const [current] = await tx.select().from(employee).where(eq(employee.personId, existing.id)).for("update");
      if (current && !current.removedAt) {
        throw new DomainError("CONFLICT", "Esta pessoa já está na lista de colaboradores.", { cpf: "Já está na lista" });
      }
      personId = existing.id;
      restoredId = current?.id ?? null;
      await tx
        .update(person)
        .set({ ...personSearchFields(input.fullName), isMinor: input.isMinor, ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}) })
        .where(eq(person.id, existing.id));
    }
  }
  if (!personId) {
    const [created] = await tx
      .insert(person)
      .values({ ...personSearchFields(input.fullName), cpf: input.cpf, whatsapp: input.whatsapp, isMinor: input.isMinor })
      .returning({ id: person.id });
    personId = created!.id;
  }
  let employeeId: string;
  if (restoredId) {
    await tx
      .update(employee)
      .set({ jobTitle: input.jobTitle, category: input.category, ...courtesyFields(input), removedAt: null, removedByUserId: null })
      .where(eq(employee.id, restoredId));
    employeeId = restoredId;
  } else {
    const [created] = await tx
      .insert(employee)
      .values({ personId, jobTitle: input.jobTitle, category: input.category, ...courtesyFields(input), createdByUserId: actor.userId })
      .returning({ id: employee.id });
    employeeId = created!.id;
  }
  const voucherInfo = await ensureActiveVoucher(tx, personId, actor.userId);
  return { employeeId, personId, restored: Boolean(restoredId), voucherCode: voucherInfo.code };
}

/** Anfitrião recém-criado (ainda sem convidado), para ligar o convidado na mesma transação. */
function newHost(created: { employeeId: string; personId: string }, input: EmployeeFields): GuestHost {
  return {
    kind: "EMPLOYEE",
    id: created.employeeId,
    personId: created.personId,
    name: input.fullName,
    cpf: input.cpf,
    guest: null,
    guestKitBeneficiaryId: null,
  };
}

export async function createEmployee(actor: Actor, raw: EmployeeInput) {
  assertPermission(actor, "manageEmployees");
  const { guest, ...input } = employeeSchema.parse(raw);
  try {
    return await withTx(async (tx) => {
      const created = await insertEmployee(tx, actor, input);
      const addedGuest = guest ? await attachGuest(tx, actor, newHost(created, input), guest) : null;
      await writeAudit(tx, actor, {
        action: "EMPLOYEE_ADDED",
        entityType: "employee",
        entityId: created.employeeId,
        summary:
          `${input.fullName} liberado(a) para a festa como ${EMPLOYEE_CATEGORY_INLINE[input.category]}${input.jobTitle ? ` (${input.jobTitle})` : ""}` +
          (input.category === "COURTESY" && !input.withKit ? ", sem kit de consumação" : "") +
          (addedGuest ? `, com convidado(a) ${addedGuest.name}.` : "."),
        after: {
          personId: created.personId,
          cpf: input.cpf ? maskCpf(input.cpf) : "não informado",
          jobTitle: input.jobTitle,
          category: EMPLOYEE_CATEGORY_LABEL[input.category],
          guest: addedGuest?.name ?? null,
          restored: created.restored,
        },
      });
      return { ...created, guest: addedGuest };
    });
  } catch (error) {
    mapEmployeeError(error);
  }
}

/**
 * Cadastra vários de uma vez (lista colada: "Nome; Setor; Convidado"). Nome
 * igual a alguém que já está na lista é pulado, para colar a mesma lista duas
 * vezes não duplicar ninguém.
 */
export async function createEmployeesFromList(actor: Actor, raw: BulkEmployeesInput) {
  assertPermission(actor, "manageEmployees");
  const input = bulkEmployeesSchema.parse(raw);
  const courtesy = input.category === "COURTESY";
  const { rows, errors } = parseEmployeeLines(input.text, { courtesy });
  if (errors.length) {
    throw new DomainError("VALIDATION", `Revise a lista: ${errors.slice(0, 3).map((e) => (e.line ? `linha ${e.line} — ${e.message}` : e.message)).join("; ")}.`, {
      text: errors.map((e) => (e.line ? `Linha ${e.line}: ${e.message}` : e.message)).join("\n"),
    });
  }
  if (rows.length === 0) throw new DomainError("VALIDATION", "Cole pelo menos um nome.", { text: "Cole pelo menos um nome" });
  try {
    return await withTx(async (tx) => {
      const current = await tx
        .select({ searchName: person.searchName })
        .from(employee)
        .innerJoin(person, eq(person.id, employee.personId))
        .where(isNull(employee.removedAt));
      const known = new Set(current.map((row) => row.searchName));
      const created: string[] = [];
      const guests: string[] = [];
      const skipped: string[] = [];
      for (const row of rows) {
        const key = toSearchText(row.fullName);
        if (known.has(key)) {
          skipped.push(row.fullName);
          continue;
        }
        known.add(key);
        const fields = {
          fullName: row.fullName,
          cpf: null,
          whatsapp: null,
          // Cortesia: quem convidou vem da linha ou, se a linha não disser, do campo da lista toda.
          jobTitle: row.jobTitle ?? (courtesy ? input.invitedBy : null),
          category: input.category,
          isMinor: false,
          withKit: courtesy ? input.withKit : true,
        };
        const employeeRow = await insertEmployee(tx, actor, fields);
        if (row.guestName) {
          const added = await attachGuest(tx, actor, newHost(employeeRow, fields), { fullName: row.guestName, cpf: null, isMinor: false });
          guests.push(added.name);
        }
        created.push(row.fullName);
      }
      if (created.length) {
        await writeAudit(tx, actor, {
          action: "EMPLOYEE_ADDED",
          entityType: "employee",
          summary: courtesy
            ? `${plural(created.length, "cortesia liberada", "cortesias liberadas")} pela lista${input.invitedBy ? ` (convite: ${input.invitedBy})` : ""}${input.withKit ? "" : ", sem kit de consumação"}.`
            : `${created.length === 1 ? "1 colaborador(a) do SINDSERM liberado(a)" : `${created.length} colaboradores do SINDSERM liberados`} pela lista (${EMPLOYEE_CATEGORY_LABEL[input.category]})` +
              (guests.length ? `, com ${plural(guests.length, "convidado", "convidados")}.` : "."),
          after: { names: created, guests, skipped },
        });
      }
      return { created: created.length, guests: guests.length, skipped };
    });
  } catch (error) {
    mapEmployeeError(error);
  }
}

export async function updateEmployee(actor: Actor, raw: UpdateEmployeeInput) {
  assertPermission(actor, "manageEmployees");
  const input = updateEmployeeSchema.parse(raw);
  try {
    return await withTx(async (tx) => {
      const current = await lockEmployeeGroupWithPeople(tx, input.employeeId);
      if (input.category === "COURTESY" && current.guest) {
        throw new DomainError("INVALID_STATE", `${COURTESY_NO_GUEST_MESSAGE} Tire o convidado de ${current.person.fullName} antes.`);
      }
      if (input.cpf && input.cpf !== current.person.cpf) {
        const [other] = await tx.select({ id: person.id }).from(person).where(eq(person.cpf, input.cpf)).limit(1);
        if (other) throw new DomainError("CPF_TAKEN", "Este CPF já pertence a outra pessoa cadastrada.", { cpf: "CPF de outra pessoa" });
      }
      await tx
        .update(person)
        .set({ ...personSearchFields(input.fullName), cpf: input.cpf, whatsapp: input.whatsapp, isMinor: input.isMinor })
        .where(eq(person.id, current.person.id));
      await tx
        .update(employee)
        .set({
          jobTitle: input.jobTitle,
          category: input.category,
          // Mudar "com/sem kit" não mexe em quem trouxe; virou colaborador(a), sempre tem kit.
          withKit: input.category === "COURTESY" ? input.withKit : true,
          ...(input.category === "COURTESY" ? {} : { hostEmployeeId: null }),
        })
        .where(eq(employee.id, current.id));
      await writeAudit(tx, actor, {
        action: "EMPLOYEE_UPDATED",
        entityType: "employee",
        entityId: current.id,
        summary: `Cadastro de ${input.fullName} (${EMPLOYEE_CATEGORY_INLINE[input.category]}) atualizado.`,
        before: { fullName: current.person.fullName, jobTitle: current.jobTitle, category: EMPLOYEE_CATEGORY_LABEL[current.category] },
        after: { fullName: input.fullName, jobTitle: input.jobTitle, category: EMPLOYEE_CATEGORY_LABEL[input.category] },
      });
      return { employeeId: current.id, personId: current.person.id };
    });
  } catch (error) {
    mapEmployeeError(error);
  }
}

/** "Rodrigo Carneiro" para o campo de quem convidou (no máximo 60 letras). */
function inviterLabel(fullName: string) {
  if (fullName.length <= 60) return fullName;
  const words = fullName.split(" ");
  return `${words[0]} ${words[words.length - 1]}`.slice(0, 60);
}

/**
 * Convidado(a) sem kit de um(a) colaborador(a): chegou junto na portaria (ou foi
 * avisado antes). Vira uma cortesia sem kit ligada a quem trouxe, com voucher
 * próprio. Quem cuida dos convidados na portaria (Atendimento) também pode.
 */
export async function addCompanion(actor: Actor, raw: CompanionInput) {
  if (actor.kind !== "staff") throw new DomainError("UNAUTHENTICATED", "Faça login para continuar.");
  if (!can(actor.access, "manageGuests") && !can(actor.access, "manageEmployees")) {
    throw new DomainError("FORBIDDEN", "Seu perfil não tem permissão para cadastrar convidado.");
  }
  const input = companionSchema.parse(raw);
  try {
    return await withTx(async (tx) => {
      const host = await lockEmployeeGroup(tx, input.hostEmployeeId);
      if (host.category === "COURTESY") throw new DomainError("INVALID_STATE", COURTESY_NO_GUEST_MESSAGE);
      if (!host.active) throw new DomainError("INVALID_STATE", "Colaborador(a) fora da lista: traga de volta antes de cadastrar convidado.");
      const created = await insertEmployee(tx, actor, {
        fullName: input.fullName,
        cpf: input.cpf,
        whatsapp: null,
        jobTitle: inviterLabel(host.person.fullName),
        category: "COURTESY",
        isMinor: input.isMinor,
        withKit: false,
        hostEmployeeId: host.id,
      });
      await writeAudit(tx, actor, {
        action: "EMPLOYEE_ADDED",
        entityType: "employee",
        entityId: created.employeeId,
        summary: `${input.fullName} entrou na lista como convidado(a) sem kit de ${host.person.fullName} (${EMPLOYEE_CATEGORY_INLINE[host.category]}).`,
        after: {
          personId: created.personId,
          cpf: input.cpf ? maskCpf(input.cpf) : "não informado",
          host: host.person.fullName,
          withKit: false,
          isMinor: input.isMinor,
        },
      });
      return { employeeId: created.employeeId, personId: created.personId, hostName: host.person.fullName };
    });
  } catch (error) {
    mapEmployeeError(error);
  }
}

/**
 * Tira da lista: o voucher deixa de valer e o convite do convidado é encerrado.
 * Quem já entrou (ou cujo convidado já entrou) só sai estornando a entrada.
 */
export async function removeEmployee(actor: Actor, input: { employeeId: string }) {
  // Quem cuida dos convidados (Atendimento) também tira o(a) convidado(a) sem kit cadastrado(a) por engano na portaria.
  const companionsOnly = actor.kind === "staff" && !can(actor.access, "manageEmployees") && can(actor.access, "manageGuests");
  if (!companionsOnly) assertPermission(actor, "manageEmployees");
  return withTx(async (tx) => {
    const current = await lockEmployeeGroupWithPeople(tx, String(input.employeeId));
    if (companionsOnly && !current.broughtBy) {
      throw new DomainError("FORBIDDEN", "Seu perfil só tira da lista convidados sem kit de colaboradores.");
    }
    if (!current.active) return { removed: false };
    if (current.checkIn) {
      throw new DomainError("INVALID_STATE", "Já entrou na festa. Para tirar da lista, estorne a entrada antes (os kits voltam ao estoque).");
    }
    let guestName: string | null = null;
    if (current.guest) {
      if (current.guest.checkIn) {
        throw new DomainError(
          "INVALID_STATE",
          `O convidado ${current.guest.fullName} já entrou na festa. Para tirar da lista, estorne a entrada dele antes.`,
        );
      }
      guestName = (await endGuestLink(tx, actor, hostFromEmployee(current), "Colaborador(a) saiu da lista")).fullName;
    }
    await tx.update(employee).set({ removedAt: new Date(), removedByUserId: actor.userId }).where(eq(employee.id, current.id));
    await revokeActiveVoucher(tx, current.person.id, actor.userId, `Removido(a) da lista de ${listName(current.category)}`);
    await writeAudit(tx, actor, {
      action: "EMPLOYEE_REMOVED",
      entityType: "employee",
      entityId: current.id,
      summary:
        `${current.person.fullName} tirado(a) da lista de ${listName(current.category)}; o voucher foi cancelado` +
        (guestName ? ` e o convite de ${guestName} também.` : "."),
    });
    return { removed: true, guestRemoved: Boolean(guestName) };
  });
}

/** Volta para a lista com um voucher novo (o antigo continua cancelado). O convidado é cadastrado de novo, se houver. */
export async function restoreEmployee(actor: Actor, input: { employeeId: string }) {
  assertPermission(actor, "manageEmployees");
  return withTx(async (tx) => {
    const current = await lockEmployeeGroupWithPeople(tx, String(input.employeeId));
    if (current.active) return { restored: false };
    await assertNotParticipant(tx, current.person.id);
    await tx.update(employee).set({ removedAt: null, removedByUserId: null }).where(eq(employee.id, current.id));
    await ensureActiveVoucher(tx, current.person.id, actor.userId);
    await writeAudit(tx, actor, {
      action: "EMPLOYEE_RESTORED",
      entityType: "employee",
      entityId: current.id,
      summary: `${current.person.fullName} voltou para a lista de ${listName(current.category)} (voucher novo).`,
    });
    return { restored: true };
  });
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export interface EmployeeGuestRow {
  guestLinkId: string;
  personId: string;
  fullName: string;
  checkedInAt: Date | null;
  kitDeliveredAt: Date | null;
}

export interface EmployeeRow {
  employeeId: string;
  personId: string;
  fullName: string;
  cpf: string | null;
  whatsapp: string | null;
  jobTitle: string | null;
  category: EmployeeCategory;
  isMinor: boolean;
  /** Cortesia com kit (colaborador(a) sempre true). */
  withKit: boolean;
  /** Convidado(a) sem kit: o cadastro do(a) colaborador(a) que trouxe. */
  hostEmployeeId: string | null;
  removedAt: Date | null;
  checkedInAt: Date | null;
  kitDeliveredAt: Date | null;
  guest: EmployeeGuestRow | null;
}

/**
 * Lista do cadastro interno. `kind`: só os colaboradores (tela Colaboradores),
 * só as cortesias (tela Cortesias) ou todos.
 */
export async function listEmployees(
  ex: Executor,
  options: { includeRemoved?: boolean; kind?: "collaborators" | "courtesies" | "all" } = {},
): Promise<EmployeeRow[]> {
  const conditions: SQL[] = [];
  if (!options.includeRemoved) conditions.push(isNull(employee.removedAt));
  if (options.kind === "collaborators") conditions.push(ne(employee.category, "COURTESY"));
  if (options.kind === "courtesies") conditions.push(eq(employee.category, "COURTESY"));
  const rows = await ex
    .select({
      employeeId: employee.id,
      personId: person.id,
      fullName: person.fullName,
      cpf: person.cpf,
      whatsapp: person.whatsapp,
      jobTitle: employee.jobTitle,
      category: employee.category,
      isMinor: person.isMinor,
      withKit: employee.withKit,
      hostEmployeeId: employee.hostEmployeeId,
      removedAt: employee.removedAt,
    })
    .from(employee)
    .innerJoin(person, eq(person.id, employee.personId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(person.searchName));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.employeeId);
  const guests = await ex
    .select({ employeeId: guestLink.employeeId, guestLinkId: guestLink.id, personId: person.id, fullName: person.fullName })
    .from(guestLink)
    .innerJoin(person, eq(person.id, guestLink.guestPersonId))
    .where(and(inArray(guestLink.employeeId, ids), eq(guestLink.status, "ACTIVE")));
  const personIds = [...rows.map((row) => row.personId), ...guests.map((guest) => guest.personId)];
  const [entries, kits] = await Promise.all([
    ex
      .select({ personId: checkIn.personId, at: checkIn.checkedInAt })
      .from(checkIn)
      .where(and(inArray(checkIn.personId, personIds), isNull(checkIn.cancelledAt))),
    ex
      .select({ employeeId: kitDelivery.employeeId, kitType: kitDelivery.kitType, at: kitDelivery.deliveredAt })
      .from(kitDelivery)
      .where(and(inArray(kitDelivery.employeeId, ids), isNull(kitDelivery.cancelledAt))),
  ]);
  const entryBy = new Map(entries.map((e) => [e.personId, e.at]));
  const kitBy = new Map(kits.map((k) => [`${k.employeeId}:${k.kitType}`, k.at]));
  const guestBy = new Map(guests.map((g) => [g.employeeId, g]));
  return rows.map((row) => {
    const guest = guestBy.get(row.employeeId);
    return {
      ...row,
      checkedInAt: entryBy.get(row.personId) ?? null,
      kitDeliveredAt: kitBy.get(`${row.employeeId}:EMPLOYEE`) ?? null,
      guest: guest
        ? {
            guestLinkId: guest.guestLinkId,
            personId: guest.personId,
            fullName: guest.fullName,
            checkedInAt: entryBy.get(guest.personId) ?? null,
            kitDeliveredAt: kitBy.get(`${row.employeeId}:GUEST`) ?? null,
          }
        : null,
    };
  });
}
