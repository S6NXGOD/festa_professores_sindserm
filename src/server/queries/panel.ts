import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, not, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import {
  affiliationDocument,
  affiliationForm,
  auditLog,
  checkIn,
  employee,
  guestLink,
  kitDelivery,
  person,
  registration,
  user,
} from "@/server/db/schema";
import type { AffiliationStatus } from "@/domain/types";
import { escapeLike } from "@/lib/text";
import { personSearchCondition } from "@/server/services/people";

export const PAGE_SIZE = 25;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pages: number;
}

export function pageNumber(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

function paged<T>(rows: T[], total: number, page: number): Page<T> {
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Nome do convidado ativo (no máximo um por professor(a)). */
const guestNameSql = sql<string | null>`(SELECT gp.full_name FROM ${guestLink} gl JOIN ${person} gp ON gp.id = gl.guest_person_id WHERE gl.registration_id = ${registration.id} AND gl.status = 'ACTIVE' LIMIT 1)`;

// ---------------------------------------------------------------------------
// Fila de conferência (filiação declarada e fichas para assinar)
// ---------------------------------------------------------------------------

export type QueueKind = "PENDING" | "AWAITING_SIGNATURE";

export async function listVerificationQueue(options: { kind: QueueKind; q?: string; page: number }) {
  const search = options.q ? personSearchCondition(options.q, { allowPartialCpf: true }) : null;
  const where = and(eq(registration.status, options.kind), search ?? undefined);
  const openForm = alias(affiliationForm, "open_form");
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        registrationId: registration.id,
        personId: person.id,
        fullName: person.fullName,
        cpf: person.cpf,
        whatsapp: person.whatsapp,
        registrationNumber: person.registrationNumber,
        workplace: person.workplace,
        isTeacher: registration.isTeacher,
        createdAt: registration.createdAt,
        origin: registration.origin,
        guestName: guestNameSql,
        formId: openForm.id,
        jobTitle: openForm.jobTitle,
      })
      .from(registration)
      .innerJoin(person, eq(person.id, registration.memberPersonId))
      .leftJoin(openForm, and(eq(openForm.registrationId, registration.id), eq(openForm.status, "DRAFT")))
      .where(where)
      .orderBy(asc(registration.createdAt))
      .limit(PAGE_SIZE)
      .offset((options.page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(registration)
      .innerJoin(person, eq(person.id, registration.memberPersonId))
      .where(where),
  ]);
  return paged(rows, Number(totalRow?.total ?? 0), options.page);
}

// ---------------------------------------------------------------------------
// Participantes (pessoas)
// ---------------------------------------------------------------------------

export type ParticipantFilter = "all" | "teachers" | "members" | "guests" | "employees" | "present" | "absent" | "pending";

export async function listParticipants(options: { q?: string; filter: ParticipantFilter; page: number }) {
  const hostReg = alias(registration, "host_reg");
  const hostPerson = alias(person, "host_person");
  // Convidado(a) de funcionário(a) do SINDSERM.
  const hostEmployee = alias(employee, "host_employee");
  const hostEmployeePerson = alias(person, "host_employee_person");
  const conditions: SQL[] = [];
  const search = options.q ? personSearchCondition(options.q, { allowPartialCpf: true }) : null;
  if (search) conditions.push(search);
  if (options.filter === "members") conditions.push(isNotNull(registration.id));
  if (options.filter === "teachers") conditions.push(eq(registration.isTeacher, true));
  if (options.filter === "guests") conditions.push(isNotNull(guestLink.id));
  if (options.filter === "employees") conditions.push(isNotNull(employee.id));
  if (options.filter === "present") conditions.push(isNotNull(checkIn.id));
  if (options.filter === "absent") {
    conditions.push(isNull(checkIn.id));
    conditions.push(
      sql`(${registration.status} IN ('PENDING','AWAITING_SIGNATURE','CONFIRMED','JOINED_AT_EVENT') OR ${hostReg.status} IN ('PENDING','AWAITING_SIGNATURE','CONFIRMED','JOINED_AT_EVENT') OR ${employee.id} IS NOT NULL OR (${hostEmployee.id} IS NOT NULL AND ${hostEmployee.removedAt} IS NULL))`,
    );
  }
  if (options.filter === "pending") conditions.push(inArray(registration.status, ["PENDING", "AWAITING_SIGNATURE"]));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        personId: person.id,
        fullName: person.fullName,
        cpf: person.cpf,
        isMinor: person.isMinor,
        memberStatus: registration.status,
        isTeacher: registration.isTeacher,
        registrationId: registration.id,
        hostName: sql<string | null>`coalesce(${hostPerson.fullName}, ${hostEmployeePerson.fullName})`,
        hostRegistrationId: hostReg.id,
        hostIsEmployee: sql<boolean>`${hostEmployee.id} IS NOT NULL`,
        checkedInAt: checkIn.checkedInAt,
        employeeJobTitle: employee.jobTitle,
        isEmployee: sql<boolean>`${employee.id} IS NOT NULL`,
      })
      .from(person)
      .leftJoin(registration, eq(registration.memberPersonId, person.id))
      .leftJoin(guestLink, and(eq(guestLink.guestPersonId, person.id), eq(guestLink.status, "ACTIVE")))
      .leftJoin(hostReg, eq(hostReg.id, guestLink.registrationId))
      .leftJoin(hostPerson, eq(hostPerson.id, hostReg.memberPersonId))
      .leftJoin(hostEmployee, eq(hostEmployee.id, guestLink.employeeId))
      .leftJoin(hostEmployeePerson, eq(hostEmployeePerson.id, hostEmployee.personId))
      .leftJoin(checkIn, and(eq(checkIn.personId, person.id), isNull(checkIn.cancelledAt)))
      .leftJoin(employee, and(eq(employee.personId, person.id), isNull(employee.removedAt)))
      .where(where)
      .orderBy(asc(person.searchName))
      .limit(PAGE_SIZE)
      .offset((options.page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(person)
      .leftJoin(registration, eq(registration.memberPersonId, person.id))
      .leftJoin(guestLink, and(eq(guestLink.guestPersonId, person.id), eq(guestLink.status, "ACTIVE")))
      .leftJoin(hostReg, eq(hostReg.id, guestLink.registrationId))
      .leftJoin(hostEmployee, eq(hostEmployee.id, guestLink.employeeId))
      .leftJoin(checkIn, and(eq(checkIn.personId, person.id), isNull(checkIn.cancelledAt)))
      .leftJoin(employee, and(eq(employee.personId, person.id), isNull(employee.removedAt)))
      .where(where),
  ]);
  return paged(rows, Number(totalRows[0]?.total ?? 0), options.page);
}

// ---------------------------------------------------------------------------
// Inscrições (grupos)
// ---------------------------------------------------------------------------

export async function listRegistrations(options: { q?: string; status?: AffiliationStatus | null; page: number }) {
  const conditions: SQL[] = [];
  const search = options.q ? personSearchCondition(options.q, { allowPartialCpf: true }) : null;
  if (search) conditions.push(search);
  if (options.status) conditions.push(eq(registration.status, options.status));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        registrationId: registration.id,
        personId: person.id,
        fullName: person.fullName,
        status: registration.status,
        isTeacher: registration.isTeacher,
        origin: registration.origin,
        createdAt: registration.createdAt,
        guestName: guestNameSql,
        kitsDelivered: sql<number>`(SELECT count(*)::int FROM ${kitDelivery} kd WHERE kd.registration_id = ${registration.id} AND kd.cancelled_at IS NULL)`,
        checkedIn: sql<boolean>`EXISTS (SELECT 1 FROM ${checkIn} ci WHERE ci.person_id = ${person.id} AND ci.cancelled_at IS NULL)`,
      })
      .from(registration)
      .innerJoin(person, eq(person.id, registration.memberPersonId))
      .where(where)
      .orderBy(desc(registration.createdAt))
      .limit(PAGE_SIZE)
      .offset((options.page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(registration)
      .innerJoin(person, eq(person.id, registration.memberPersonId))
      .where(where),
  ]);
  return paged(rows, Number(totalRow?.total ?? 0), options.page);
}

/** Convidados que já saíram do grupo (removidos ou convertidos em filiados). */
export async function getFormerGuests(registrationId: string) {
  return db
    .select({
      guestLinkId: guestLink.id,
      personId: person.id,
      fullName: person.fullName,
      status: guestLink.status,
      endedAt: guestLink.endedAt,
      endReason: guestLink.endReason,
    })
    .from(guestLink)
    .innerJoin(person, eq(person.id, guestLink.guestPersonId))
    .where(and(eq(guestLink.registrationId, registrationId), not(eq(guestLink.status, "ACTIVE"))))
    .orderBy(desc(guestLink.endedAt));
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

export async function listAuditEntries(options: {
  page: number;
  action?: string | null;
  q?: string | null;
  entityType?: string | null;
  entityIds?: string[];
}) {
  const conditions: SQL[] = [];
  if (options.action) conditions.push(eq(auditLog.action, options.action));
  if (options.entityType) conditions.push(eq(auditLog.entityType, options.entityType));
  if (options.entityIds?.length) conditions.push(inArray(auditLog.entityId, options.entityIds));
  if (options.q) {
    const term = `%${escapeLike(options.q.trim())}%`;
    conditions.push(sql`(${ilike(auditLog.summary, term)} OR ${ilike(auditLog.actorLabel, term)})`);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(PAGE_SIZE)
      .offset((options.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);
  return paged(rows, Number(totalRow?.total ?? 0), options.page);
}

export async function recentAuditFor(entityIds: string[], limit = 30) {
  if (!entityIds.length) return [];
  return db
    .select()
    .from(auditLog)
    .where(inArray(auditLog.entityId, entityIds))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Novas filiações
// ---------------------------------------------------------------------------

export async function listAffiliationForms(options: {
  status?: "DRAFT" | "FORMALIZED" | "CANCELLED" | null;
  q?: string;
  page: number;
}) {
  const conditions: SQL[] = [];
  if (options.status) conditions.push(eq(affiliationForm.status, options.status));
  const search = options.q ? personSearchCondition(options.q, { allowPartialCpf: true }) : null;
  if (search) conditions.push(search);
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: affiliationForm.id,
        personId: affiliationForm.personId,
        fullName: affiliationForm.fullName,
        status: affiliationForm.status,
        origin: affiliationForm.origin,
        isTeacher: affiliationForm.isTeacher,
        createdAt: affiliationForm.createdAt,
        formalizedAt: affiliationForm.formalizedAt,
        createdBy: user.name,
        registrationId: affiliationForm.registrationId,
        cpf: affiliationForm.cpf,
        whatsapp: affiliationForm.whatsapp,
        registrationNumber: affiliationForm.registrationNumber,
        workplace: affiliationForm.workplace,
        jobTitle: affiliationForm.jobTitle,
        guestName: sql<string | null>`(SELECT gp.full_name FROM ${guestLink} gl JOIN ${person} gp ON gp.id = gl.guest_person_id WHERE gl.registration_id = ${affiliationForm.registrationId} AND gl.status = 'ACTIVE' LIMIT 1)`,
        // A assinatura só vale com as cópias do RG e do contracheque anexadas.
        hasRg: sql<boolean>`EXISTS (SELECT 1 FROM ${affiliationDocument} d WHERE d.form_id = ${affiliationForm.id} AND d.kind = 'RG')`,
        hasPayslip: sql<boolean>`EXISTS (SELECT 1 FROM ${affiliationDocument} d WHERE d.form_id = ${affiliationForm.id} AND d.kind = 'PAYSLIP')`,
      })
      .from(affiliationForm)
      .leftJoin(user, eq(user.id, affiliationForm.createdByUserId))
      .innerJoin(person, eq(person.id, affiliationForm.personId))
      .where(where)
      // Fila de assinatura: quem espera há mais tempo primeiro.
      .orderBy(options.status === "DRAFT" ? asc(affiliationForm.createdAt) : desc(affiliationForm.createdAt))
      .limit(PAGE_SIZE)
      .offset((options.page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(affiliationForm)
      .innerJoin(person, eq(person.id, affiliationForm.personId))
      .where(where),
  ]);
  return paged(rows, Number(totalRow?.total ?? 0), options.page);
}

export async function getAffiliationForm(id: string) {
  const formalizer = alias(user, "formalizer");
  const [row] = await db
    .select({
      form: affiliationForm,
      createdBy: user.name,
      formalizedBy: formalizer.name,
    })
    .from(affiliationForm)
    .leftJoin(user, eq(user.id, affiliationForm.createdByUserId))
    .leftJoin(formalizer, eq(formalizer.id, affiliationForm.formalizedByUserId))
    .where(eq(affiliationForm.id, id))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Kits
// ---------------------------------------------------------------------------

export async function listDeliveries(options: { page: number }) {
  const member = alias(person, "member");
  const beneficiary = alias(person, "beneficiary");
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: kitDelivery.id,
        kitType: kitDelivery.kitType,
        deliveredAt: kitDelivery.deliveredAt,
        deliveredBy: user.name,
        memberName: member.fullName,
        memberPersonId: member.id,
        beneficiaryName: beneficiary.fullName,
        beneficiaryPersonId: beneficiary.id,
        /** O kit é do grupo de um(a) funcionário(a) do SINDSERM (estoque dos funcionários). */
        employeeGroup: sql<boolean>`${kitDelivery.employeeId} IS NOT NULL`,
        cancelledAt: kitDelivery.cancelledAt,
        cancelReason: kitDelivery.cancelReason,
      })
      .from(kitDelivery)
      .innerJoin(user, eq(user.id, kitDelivery.deliveredByUserId))
      .innerJoin(member, eq(member.id, kitDelivery.recipientPersonId))
      .innerJoin(beneficiary, eq(beneficiary.id, kitDelivery.beneficiaryPersonId))
      .orderBy(desc(kitDelivery.deliveredAt))
      .limit(PAGE_SIZE)
      .offset((options.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(kitDelivery),
  ]);
  return paged(rows, Number(totalRow?.total ?? 0), options.page);
}

// ---------------------------------------------------------------------------
// Usuários e painel
// ---------------------------------------------------------------------------

export async function listStaffUsers() {
  return db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, createdAt: user.createdAt })
    .from(user)
    .orderBy(desc(user.active), asc(user.name));
}

export async function recentCheckIns(limit = 8) {
  return db
    .select({
      personId: person.id,
      fullName: person.fullName,
      role: checkIn.role,
      checkedInAt: checkIn.checkedInAt,
      byName: user.name,
    })
    .from(checkIn)
    .innerJoin(person, eq(person.id, checkIn.personId))
    .innerJoin(user, eq(user.id, checkIn.checkedInByUserId))
    .where(isNull(checkIn.cancelledAt))
    .orderBy(desc(checkIn.checkedInAt))
    .limit(limit);
}

/** Tamanho das filas (badges do menu): inscrições para conferir e fichas para assinar. */
export async function queueCounts() {
  const [[pending], [signature]] = await Promise.all([
    db.select({ total: count() }).from(registration).where(eq(registration.status, "PENDING")),
    db.select({ total: count() }).from(affiliationForm).where(eq(affiliationForm.status, "DRAFT")),
  ]);
  return { pending: Number(pending?.total ?? 0), signature: Number(signature?.total ?? 0) };
}

export type QueueCounts = Awaited<ReturnType<typeof queueCounts>>;
export type VerificationRow = Awaited<ReturnType<typeof listVerificationQueue>>["rows"][number];
export type AffiliationFormRow = Awaited<ReturnType<typeof listAffiliationForms>>["rows"][number];
