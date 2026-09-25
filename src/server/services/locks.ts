import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { employee, person, registration } from "@/server/db/schema";
import { DomainError } from "./errors";
import { type EmployeeGroupState, loadEmployeeGroup, loadRegistrationState } from "./state";

/*
 * Ordem de bloqueio para evitar deadlocks: primeiro inscrições (registration),
 * depois funcionários (employee), depois pessoas (person), sempre ordenados
 * por id. Inscrição e funcionário são o "grupo" (quem convidou + convidado +
 * kits). O check-in bloqueia a pessoa, então operações que dependem da entrada
 * também bloqueiam a pessoa.
 */

export async function lockRegistrationRow(tx: Tx, registrationId: string) {
  const [row] = await tx
    .select({ id: registration.id })
    .from(registration)
    .where(eq(registration.id, registrationId))
    .for("update");
  if (!row) throw new DomainError("NOT_FOUND", "Inscrição não encontrada.");
}

export async function lockEmployeeRows(tx: Tx, employeeIds: string[]) {
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) return;
  const rows = await tx.select({ id: employee.id }).from(employee).where(inArray(employee.id, ids)).orderBy(asc(employee.id)).for("update");
  if (rows.length !== ids.length) throw new DomainError("NOT_FOUND", "Funcionário(a) não encontrado(a).");
}

export async function lockPersons(tx: Tx, personIds: string[]) {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return;
  await tx.select({ id: person.id }).from(person).where(inArray(person.id, ids)).orderBy(asc(person.id)).for("update");
}

/** Bloqueia a inscrição e devolve o estado atualizado. */
export async function lockRegistration(tx: Tx, registrationId: string) {
  await lockRegistrationRow(tx, registrationId);
  const state = await loadRegistrationState(tx, registrationId);
  if (!state) throw new DomainError("NOT_FOUND", "Inscrição não encontrada.");
  return state;
}

/**
 * Bloqueia a inscrição e as pessoas do grupo (filiado + convidado ativo) e
 * devolve o estado lido depois dos bloqueios — necessário quando a regra
 * depende de entradas (check-in) que podem ocorrer em paralelo.
 */
export async function lockRegistrationWithPeople(tx: Tx, registrationId: string, extraPersonIds: string[] = []) {
  const before = await lockRegistration(tx, registrationId);
  await lockPersons(tx, [before.member.id, ...(before.guest ? [before.guest.personId] : []), ...extraPersonIds]);
  const state = await loadRegistrationState(tx, registrationId);
  if (!state) throw new DomainError("NOT_FOUND", "Inscrição não encontrada.");
  return state;
}

/** Bloqueia o(a) funcionário(a) (o grupo) e devolve o estado atualizado. */
export async function lockEmployeeGroup(tx: Tx, employeeId: string): Promise<EmployeeGroupState> {
  await lockEmployeeRows(tx, [employeeId]);
  const state = await loadEmployeeGroup(tx, employeeId);
  if (!state) throw new DomainError("NOT_FOUND", "Funcionário(a) não encontrado(a).");
  return state;
}

/** Como `lockRegistrationWithPeople`, para o grupo de um(a) funcionário(a) (ele(a) + convidado). */
export async function lockEmployeeGroupWithPeople(tx: Tx, employeeId: string, extraPersonIds: string[] = []) {
  const before = await lockEmployeeGroup(tx, employeeId);
  await lockPersons(tx, [before.person.id, ...(before.guest ? [before.guest.personId] : []), ...extraPersonIds]);
  const state = await loadEmployeeGroup(tx, employeeId);
  if (!state) throw new DomainError("NOT_FOUND", "Funcionário(a) não encontrado(a).");
  return state;
}
