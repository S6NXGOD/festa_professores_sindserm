import "server-only";
import { and, count, desc, eq, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import { checkIn, employee, guestLink, kitDelivery, person, registration, user } from "@/server/db/schema";
import { CHECK_IN_METHOD_LABEL, EMPLOYEE_CATEGORY_LABEL } from "@/domain/labels";
import type { CheckInMethod, EmployeeCategory, ParticipantRole } from "@/domain/types";
import { formatDateTimeSeconds } from "@/lib/datetime";
import { personSearchCondition } from "@/server/services/people";
import { type Page, PAGE_SIZE } from "./panel";

/*
 * Controle de entrada: cada entrada registrada na portaria, com quem registrou,
 * como (QR, busca, código), os kits que saíram junto e os estornos.
 */

export const ENTRY_FILTERS = ["todas", "filiados", "convidados", "colaboradores", "estornadas"] as const;
export type EntryFilter = (typeof ENTRY_FILTERS)[number];

export interface EntryRow {
  id: string;
  personId: string;
  fullName: string;
  role: ParticipantRole;
  isTeacher: boolean | null;
  hostName: string | null;
  /** Convidado(a) de colaborador(a) do SINDSERM. */
  hostIsEmployee: boolean;
  employeeCategory: EmployeeCategory | null;
  employeeJobTitle: string | null;
  method: CheckInMethod;
  checkedInAt: Date;
  byUserId: string;
  byName: string;
  /** Kits que saíram na mesma operação da entrada (o do convidado que já tinha entrado conta aqui). */
  kitsAtEntry: number;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
}

const canceller = alias(user, "canceller");
const hostEmployee = alias(employee, "host_employee");
const hostEmployeePerson = alias(person, "host_employee_person");
const hostRegistration = alias(registration, "host_registration");
const hostPerson = alias(person, "host_person");

/*
 * Os kits da entrada são gravados na mesma transação que ela: mesmo instante
 * (o now() da transação) e mesma pessoa da portaria.
 */
const kitsAtEntrySql = sql<number>`(SELECT count(*)::int FROM ${kitDelivery} kd
  WHERE kd.delivered_at = ${checkIn.checkedInAt} AND kd.delivered_by_user_id = ${checkIn.checkedInByUserId} AND kd.cancelled_at IS NULL)`;

function filterConditions(options: { q?: string; filter: EntryFilter; operator?: string | null }): SQL[] {
  const conditions: SQL[] = [];
  conditions.push(options.filter === "estornadas" ? isNotNull(checkIn.cancelledAt) : isNull(checkIn.cancelledAt));
  if (options.filter === "filiados") conditions.push(eq(checkIn.role, "MEMBER"));
  if (options.filter === "convidados") conditions.push(eq(checkIn.role, "GUEST"));
  if (options.filter === "colaboradores") conditions.push(eq(checkIn.role, "EMPLOYEE"));
  if (options.operator) conditions.push(eq(checkIn.checkedInByUserId, options.operator));
  const search = options.q ? personSearchCondition(options.q, { allowPartialCpf: true }) : null;
  if (search) conditions.push(search);
  return conditions;
}

function entriesQuery() {
  return db
    .select({
      id: checkIn.id,
      personId: person.id,
      fullName: person.fullName,
      role: checkIn.role,
      isTeacher: sql<boolean | null>`CASE WHEN ${checkIn.role} = 'MEMBER' THEN ${registration.isTeacher} END`,
      hostName: sql<string | null>`CASE WHEN ${checkIn.role} = 'GUEST' THEN coalesce(${hostPerson.fullName}, ${hostEmployeePerson.fullName}) END`,
      hostIsEmployee: sql<boolean>`${hostEmployee.id} IS NOT NULL`,
      employeeCategory: employee.category,
      employeeJobTitle: employee.jobTitle,
      method: checkIn.method,
      checkedInAt: checkIn.checkedInAt,
      byUserId: checkIn.checkedInByUserId,
      byName: user.name,
      kitsAtEntry: kitsAtEntrySql,
      cancelledAt: checkIn.cancelledAt,
      cancelledByName: canceller.name,
      cancelReason: checkIn.cancelReason,
    })
    .from(checkIn)
    .innerJoin(person, eq(person.id, checkIn.personId))
    .innerJoin(user, eq(user.id, checkIn.checkedInByUserId))
    .leftJoin(canceller, eq(canceller.id, checkIn.cancelledByUserId))
    .leftJoin(registration, eq(registration.id, checkIn.registrationId))
    .leftJoin(employee, eq(employee.id, checkIn.employeeId))
    .leftJoin(guestLink, eq(guestLink.id, checkIn.guestLinkId))
    .leftJoin(hostRegistration, eq(hostRegistration.id, guestLink.registrationId))
    .leftJoin(hostPerson, eq(hostPerson.id, hostRegistration.memberPersonId))
    .leftJoin(hostEmployee, eq(hostEmployee.id, guestLink.employeeId))
    .leftJoin(hostEmployeePerson, eq(hostEmployeePerson.id, hostEmployee.personId));
}

/** Entradas da mais recente para a mais antiga, com os filtros da tela. */
export async function listEntries(options: { q?: string; filter: EntryFilter; operator?: string | null; page: number }): Promise<Page<EntryRow>> {
  const where = and(...filterConditions(options));
  const [rows, [totalRow]] = await Promise.all([
    entriesQuery()
      .where(where)
      .orderBy(desc(options.filter === "estornadas" ? checkIn.cancelledAt : checkIn.checkedInAt), desc(checkIn.id))
      .limit(PAGE_SIZE)
      .offset((options.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(checkIn).innerJoin(person, eq(person.id, checkIn.personId)).where(where),
  ]);
  const total = Number(totalRow?.total ?? 0);
  return { rows, total, page: options.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Todas as entradas (inclusive estornadas), para a planilha. */
export async function allEntriesForExport(): Promise<EntryRow[]> {
  return entriesQuery().orderBy(checkIn.checkedInAt, checkIn.id);
}

export interface EntrySummary {
  /** Entradas valendo (sem as estornadas). */
  total: number;
  cancelled: number;
  /** Registradas antes do horário de início (com a confirmação a mais da portaria). */
  early: number;
  byMethod: Record<CheckInMethod, number>;
  /** Quem registrou quantas entradas (placar da portaria). */
  operators: { userId: string; name: string; total: number }[];
}

export async function entrySummary(eventStart: Date | null): Promise<EntrySummary> {
  const [totals] = await db
    .select({
      total: sql<number>`count(*) FILTER (WHERE ${checkIn.cancelledAt} IS NULL)::int`,
      cancelled: sql<number>`count(*) FILTER (WHERE ${checkIn.cancelledAt} IS NOT NULL)::int`,
      early: eventStart
        ? sql<number>`count(*) FILTER (WHERE ${checkIn.cancelledAt} IS NULL AND ${checkIn.checkedInAt} < ${eventStart.toISOString()}::timestamptz)::int`
        : sql<number>`0`,
      qr: sql<number>`count(*) FILTER (WHERE ${checkIn.cancelledAt} IS NULL AND ${checkIn.method} = 'QR')::int`,
      search: sql<number>`count(*) FILTER (WHERE ${checkIn.cancelledAt} IS NULL AND ${checkIn.method} = 'SEARCH')::int`,
      code: sql<number>`count(*) FILTER (WHERE ${checkIn.cancelledAt} IS NULL AND ${checkIn.method} = 'CODE')::int`,
    })
    .from(checkIn);
  const operators = await db
    .select({ userId: user.id, name: user.name, total: sql<number>`count(*)::int` })
    .from(checkIn)
    .innerJoin(user, eq(user.id, checkIn.checkedInByUserId))
    .where(isNull(checkIn.cancelledAt))
    .groupBy(user.id, user.name)
    .orderBy(desc(sql`count(*)`), user.name);
  return {
    total: Number(totals?.total ?? 0),
    cancelled: Number(totals?.cancelled ?? 0),
    early: Number(totals?.early ?? 0),
    byMethod: { QR: Number(totals?.qr ?? 0), SEARCH: Number(totals?.search ?? 0), CODE: Number(totals?.code ?? 0) },
    operators: operators.map((row) => ({ ...row, total: Number(row.total) })),
  };
}

/** Quem já registrou alguma entrada (para o filtro "registradas por"). */
export async function entryOperators(): Promise<{ userId: string; name: string }[]> {
  return db
    .selectDistinct({ userId: user.id, name: user.name })
    .from(checkIn)
    .innerJoin(user, eq(user.id, checkIn.checkedInByUserId))
    .orderBy(user.name);
}

// ---------------------------------------------------------------------------
// Planilha (formato do Excel em português: ";" e UTF-8 com BOM)
// ---------------------------------------------------------------------------

const CSV_HEADER = [
  "Horário",
  "Nome",
  "Tipo",
  "Convidado(a) de",
  "Registrada por",
  "Como",
  "Kits na entrada",
  "Antes do horário",
  "Situação",
  "Estornada por",
  "Estornada em",
  "Motivo do estorno",
];

/** Célula segura: nome digitado no site não vira fórmula no Excel (=, +, -, @). */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function entryType(row: EntryRow): string {
  if (row.role === "GUEST") return "Convidado(a)";
  if (row.role === "EMPLOYEE") return `Colaborador(a) · ${row.employeeCategory ? EMPLOYEE_CATEGORY_LABEL[row.employeeCategory] : "SINDSERM"}`;
  return row.isTeacher ? "Professor(a)" : "Filiado(a)";
}

export function entriesCsv(rows: EntryRow[], eventStart: Date | null): string {
  const lines = [
    CSV_HEADER.map(csvCell).join(";"),
    ...rows.map((row) =>
      [
        formatDateTimeSeconds(row.checkedInAt),
        row.fullName,
        entryType(row),
        row.role === "GUEST" ? row.hostName : "",
        row.byName,
        CHECK_IN_METHOD_LABEL[row.method],
        row.cancelledAt ? 0 : row.kitsAtEntry,
        eventStart && row.checkedInAt < eventStart ? "Sim" : "Não",
        row.cancelledAt ? "Estornada" : "Valendo",
        row.cancelledByName ?? "",
        row.cancelledAt ? formatDateTimeSeconds(row.cancelledAt) : "",
        row.cancelReason ?? "",
      ]
        .map(csvCell)
        .join(";"),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
