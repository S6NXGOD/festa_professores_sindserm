import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Executor, Tx } from "@/server/db";
import { checkIn, employee, guestLink, kitDelivery, person } from "@/server/db/schema";
import {
  type BulkEmployeesInput,
  bulkEmployeesSchema,
  type EmployeeData,
  type EmployeeInput,
  employeeSchema,
  parseEmployeeLines,
  type UpdateEmployeeInput,
  updateEmployeeSchema,
} from "@/domain/schemas";
import { maskCpf } from "@/lib/cpf";
import { plural } from "@/lib/plural";
import { toSearchText } from "@/lib/text";
import { type Actor, assertPermission, type StaffActor } from "./actor";
import { writeAudit } from "./audit";
import { DomainError, isUniqueViolation } from "./errors";
import { attachGuest, endGuestLink, type GuestHost, hostFromEmployee, mapGuestError } from "./group";
import { lockEmployeeGroupWithPeople } from "./locks";
import { personSearchFields } from "./registration";
import { findActiveGuestLink, findRegistrationIdByMember } from "./state";
import { withTx } from "./tx";
import { ensureActiveVoucher, revokeActiveVoucher } from "./vouchers";

/*
 * Funcionários do SINDSERM liberados para a festa: cadastro só interno (pelo
 * administrador), voucher próprio, 1 kit do estoque dos funcionários e 1
 * convidado (com kit do mesmo estoque, depois que o funcionário chegar).
 */

function mapEmployeeError(error: unknown): never {
  if (isUniqueViolation(error, "person_cpf_unique")) {
    throw new DomainError("CPF_TAKEN", "Este CPF acabou de ser cadastrado. Tente de novo.", { cpf: "CPF já cadastrado" });
  }
  if (isUniqueViolation(error, "employee_person_unique")) {
    throw new DomainError("CONFLICT", "Esta pessoa já está na lista de funcionários.", { cpf: "Já está na lista" });
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

type EmployeeFields = Omit<EmployeeData, "guest">;

async function insertEmployee(tx: Tx, actor: StaffActor, input: EmployeeFields) {
  let personId: string | null = null;
  let restoredId: string | null = null;
  if (input.cpf) {
    const [existing] = await tx.select({ id: person.id }).from(person).where(eq(person.cpf, input.cpf)).for("update");
    if (existing) {
      await assertNotParticipant(tx, existing.id);
      const [current] = await tx.select().from(employee).where(eq(employee.personId, existing.id)).for("update");
      if (current && !current.removedAt) {
        throw new DomainError("CONFLICT", "Esta pessoa já está na lista de funcionários.", { cpf: "Já está na lista" });
      }
      personId = existing.id;
      restoredId = current?.id ?? null;
      await tx
        .update(person)
        .set({ ...personSearchFields(input.fullName), ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}) })
        .where(eq(person.id, existing.id));
    }
  }
  if (!personId) {
    const [created] = await tx
      .insert(person)
      .values({ ...personSearchFields(input.fullName), cpf: input.cpf, whatsapp: input.whatsapp })
      .returning({ id: person.id });
    personId = created!.id;
  }
  let employeeId: string;
  if (restoredId) {
    await tx.update(employee).set({ jobTitle: input.jobTitle, removedAt: null, removedByUserId: null }).where(eq(employee.id, restoredId));
    employeeId = restoredId;
  } else {
    const [created] = await tx
      .insert(employee)
      .values({ personId, jobTitle: input.jobTitle, createdByUserId: actor.userId })
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
          `${input.fullName} liberado(a) para a festa como funcionário(a) do SINDSERM${input.jobTitle ? ` (${input.jobTitle})` : ""}` +
          (addedGuest ? `, com convidado(a) ${addedGuest.name}.` : "."),
        after: {
          personId: created.personId,
          cpf: input.cpf ? maskCpf(input.cpf) : "não informado",
          jobTitle: input.jobTitle,
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
  const { rows, errors } = parseEmployeeLines(input.text);
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
        const fields = { fullName: row.fullName, cpf: null, whatsapp: null, jobTitle: row.jobTitle };
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
          summary:
            `${created.length === 1 ? "1 funcionário(a) do SINDSERM liberado(a)" : `${created.length} funcionários do SINDSERM liberados`} pela lista` +
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
      if (input.cpf && input.cpf !== current.person.cpf) {
        const [other] = await tx.select({ id: person.id }).from(person).where(eq(person.cpf, input.cpf)).limit(1);
        if (other) throw new DomainError("CPF_TAKEN", "Este CPF já pertence a outra pessoa cadastrada.", { cpf: "CPF de outra pessoa" });
      }
      await tx
        .update(person)
        .set({ ...personSearchFields(input.fullName), cpf: input.cpf, whatsapp: input.whatsapp })
        .where(eq(person.id, current.person.id));
      await tx.update(employee).set({ jobTitle: input.jobTitle }).where(eq(employee.id, current.id));
      await writeAudit(tx, actor, {
        action: "EMPLOYEE_UPDATED",
        entityType: "employee",
        entityId: current.id,
        summary: `Cadastro de ${input.fullName} (funcionário(a) do SINDSERM) atualizado.`,
        before: { fullName: current.person.fullName, jobTitle: current.jobTitle },
        after: { fullName: input.fullName, jobTitle: input.jobTitle },
      });
      return { employeeId: current.id, personId: current.person.id };
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
  assertPermission(actor, "manageEmployees");
  return withTx(async (tx) => {
    const current = await lockEmployeeGroupWithPeople(tx, String(input.employeeId));
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
      guestName = (await endGuestLink(tx, actor, hostFromEmployee(current), "Funcionário(a) saiu da lista")).fullName;
    }
    await tx.update(employee).set({ removedAt: new Date(), removedByUserId: actor.userId }).where(eq(employee.id, current.id));
    await revokeActiveVoucher(tx, current.person.id, actor.userId, "Removido(a) da lista de funcionários");
    await writeAudit(tx, actor, {
      action: "EMPLOYEE_REMOVED",
      entityType: "employee",
      entityId: current.id,
      summary:
        `${current.person.fullName} tirado(a) da lista de funcionários; o voucher foi cancelado` +
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
      summary: `${current.person.fullName} voltou para a lista de funcionários (voucher novo).`,
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
  removedAt: Date | null;
  checkedInAt: Date | null;
  kitDeliveredAt: Date | null;
  guest: EmployeeGuestRow | null;
}

export async function listEmployees(ex: Executor, options: { includeRemoved?: boolean } = {}): Promise<EmployeeRow[]> {
  const rows = await ex
    .select({
      employeeId: employee.id,
      personId: person.id,
      fullName: person.fullName,
      cpf: person.cpf,
      whatsapp: person.whatsapp,
      jobTitle: employee.jobTitle,
      removedAt: employee.removedAt,
    })
    .from(employee)
    .innerJoin(person, eq(person.id, employee.personId))
    .where(options.includeRemoved ? undefined : isNull(employee.removedAt))
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
