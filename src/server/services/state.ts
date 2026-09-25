import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Executor } from "@/server/db";
import {
  affiliationDocument,
  affiliationForm,
  checkIn,
  employee,
  guestLink,
  kitDelivery,
  person,
  registration,
  user,
  voucher,
} from "@/server/db/schema";
import type { AffiliationStatus, CheckInInfo, Deliveries, DeliveryInfo, DocumentKind, EmployeeDeliveries, EmployeeCategory } from "@/domain/types";
import type { RegistrationOrigin } from "@/server/db/schema";

export interface PersonBasics {
  id: string;
  fullName: string;
  cpf: string | null;
  whatsapp: string | null;
  registrationNumber: string | null;
  workplace: string | null;
  isMinor: boolean;
  createdAt: Date;
}

export interface ActiveGuest {
  guestLinkId: string;
  personId: string;
  fullName: string;
  cpf: string | null;
  isMinor: boolean;
  checkIn: CheckInInfo | null;
  addedAt: Date;
}

export interface RegistrationState {
  id: string;
  status: AffiliationStatus;
  isTeacher: boolean;
  origin: RegistrationOrigin;
  createdAt: Date;
  statusChangedAt: Date | null;
  statusChangedByName: string | null;
  statusNote: string | null;
  member: PersonBasics;
  memberCheckIn: CheckInInfo | null;
  /** Convidado ativo (no máximo um por professor(a)). */
  guest: ActiveGuest | null;
  deliveries: Deliveries;
  /** O(a) filiado(a) já recebeu um kit como convidado(a) de outra pessoa (antes de se filiar). */
  memberReceivedGuestKit: boolean;
}

export interface GuestOfState {
  guestLinkId: string;
  addedAt: Date;
  host: RegistrationState;
}

export interface PastGuestLink {
  guestLinkId: string;
  status: "REMOVED" | "CONVERTED";
  hostName: string;
  /** Inscrição do(a) professor(a) que convidou (nulo quando foi um(a) funcionário(a)). */
  hostRegistrationId: string | null;
  hostIsEmployee: boolean;
  addedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
}

/**
 * Funcionário(a) do SINDSERM com o convidado dele(a) e os kits do grupo (o
 * dele(a) e o do convidado, do estoque dos funcionários). Removido(a) = não
 * entra mais, mas o histórico fica.
 */
export interface EmployeeGroupState {
  id: string;
  jobTitle: string | null;
  category: EmployeeCategory;
  active: boolean;
  person: PersonBasics;
  /** Entrada do(a) próprio(a) funcionário(a). */
  checkIn: CheckInInfo | null;
  /** Convidado ativo (no máximo um por funcionário(a)). */
  guest: ActiveGuest | null;
  deliveries: EmployeeDeliveries;
}

export interface GuestOfEmployeeState {
  guestLinkId: string;
  addedAt: Date;
  host: EmployeeGroupState;
}

/** Quantos arquivos de cada documento a ficha tem. */
export type DocumentCounts = Record<DocumentKind, number>;

export interface FormFile {
  id: string;
  kind: DocumentKind;
  isPdf: boolean;
}

export interface OpenAffiliationForm {
  id: string;
  status: "DRAFT" | "FORMALIZED";
  origin: "PUBLIC" | "STAFF";
  documents: DocumentCounts;
  files: FormFile[];
}

export interface PersonState {
  person: PersonBasics;
  checkIn: CheckInInfo | null;
  voucher: { id: string; code: string; issuedAt: Date } | null;
  ownRegistration: RegistrationState | null;
  /** Convidado(a) ativo(a) de um(a) professor(a). */
  guestOf: GuestOfState | null;
  /** Convidado(a) ativo(a) de um(a) funcionário(a) do SINDSERM. */
  guestOfEmployee: GuestOfEmployeeState | null;
  pastGuestLinks: PastGuestLink[];
  openAffiliationForm: OpenAffiliationForm | null;
  /** Cadastro como funcionário(a) do SINDSERM (com o convidado e os kits do grupo). */
  employee: EmployeeGroupState | null;
}

const personColumns = {
  id: person.id,
  fullName: person.fullName,
  cpf: person.cpf,
  whatsapp: person.whatsapp,
  registrationNumber: person.registrationNumber,
  workplace: person.workplace,
  isMinor: person.isMinor,
  createdAt: person.createdAt,
};

export async function loadActiveCheckIns(ex: Executor, personIds: string[]) {
  const map = new Map<string, CheckInInfo>();
  if (personIds.length === 0) return map;
  const rows = await ex
    .select({
      id: checkIn.id,
      personId: checkIn.personId,
      checkedInAt: checkIn.checkedInAt,
      method: checkIn.method,
      role: checkIn.role,
      checkedInByName: user.name,
    })
    .from(checkIn)
    .innerJoin(user, eq(user.id, checkIn.checkedInByUserId))
    .where(and(inArray(checkIn.personId, personIds), isNull(checkIn.cancelledAt)));
  for (const row of rows) {
    map.set(row.personId, {
      id: row.id,
      checkedInAt: row.checkedInAt,
      checkedInByName: row.checkedInByName,
      method: row.method,
      role: row.role,
    });
  }
  return map;
}

async function loadDeliveries(ex: Executor, registrationId: string): Promise<Deliveries> {
  const beneficiary = alias(person, "beneficiary");
  const rows = await ex
    .select({
      id: kitDelivery.id,
      kitType: kitDelivery.kitType,
      deliveredAt: kitDelivery.deliveredAt,
      deliveredByName: user.name,
      beneficiaryPersonId: kitDelivery.beneficiaryPersonId,
      beneficiaryName: beneficiary.fullName,
    })
    .from(kitDelivery)
    .innerJoin(user, eq(user.id, kitDelivery.deliveredByUserId))
    .innerJoin(beneficiary, eq(beneficiary.id, kitDelivery.beneficiaryPersonId))
    .where(and(eq(kitDelivery.registrationId, registrationId), isNull(kitDelivery.cancelledAt)));
  const deliveries: Deliveries = {};
  for (const row of rows) {
    // Kits de funcionário não pertencem a inscrições (constraint kit_delivery_owner).
    if (row.kitType !== "EMPLOYEE") deliveries[row.kitType] = row satisfies DeliveryInfo;
  }
  return deliveries;
}

/** Kits (ativos) do grupo de um(a) funcionário(a): o dele(a) e o do convidado. */
async function loadEmployeeDeliveries(ex: Executor, employeeId: string): Promise<EmployeeDeliveries> {
  const beneficiary = alias(person, "beneficiary");
  const rows = await ex
    .select({
      id: kitDelivery.id,
      kitType: kitDelivery.kitType,
      deliveredAt: kitDelivery.deliveredAt,
      deliveredByName: user.name,
      beneficiaryPersonId: kitDelivery.beneficiaryPersonId,
      beneficiaryName: beneficiary.fullName,
    })
    .from(kitDelivery)
    .innerJoin(user, eq(user.id, kitDelivery.deliveredByUserId))
    .innerJoin(beneficiary, eq(beneficiary.id, kitDelivery.beneficiaryPersonId))
    .where(and(eq(kitDelivery.employeeId, employeeId), isNull(kitDelivery.cancelledAt)));
  const deliveries: EmployeeDeliveries = {};
  for (const row of rows) {
    // Kit de professor(a) nunca pertence ao grupo de um(a) funcionário(a) (constraint kit_delivery_owner).
    if (row.kitType !== "MEMBER") deliveries[row.kitType] = row satisfies DeliveryInfo;
  }
  return deliveries;
}

/** Funcionário(a) do SINDSERM não é filiado(a) nem convidado(a) ao mesmo tempo. */
export async function isActiveEmployee(ex: Executor, personId: string) {
  const [row] = await ex
    .select({ id: employee.id })
    .from(employee)
    .where(and(eq(employee.personId, personId), isNull(employee.removedAt)))
    .limit(1);
  return Boolean(row);
}

/** Funcionário(a), convidado ativo, entradas e kits do grupo. */
export async function loadEmployeeGroup(ex: Executor, employeeId: string): Promise<EmployeeGroupState | null> {
  const [row] = await ex
    .select({ id: employee.id, jobTitle: employee.jobTitle, category: employee.category, removedAt: employee.removedAt, person: personColumns })
    .from(employee)
    .innerJoin(person, eq(person.id, employee.personId))
    .where(eq(employee.id, employeeId))
    .limit(1);
  if (!row) return null;
  const [guestRow] = await ex
    .select({
      guestLinkId: guestLink.id,
      addedAt: guestLink.createdAt,
      personId: person.id,
      fullName: person.fullName,
      cpf: person.cpf,
      isMinor: person.isMinor,
    })
    .from(guestLink)
    .innerJoin(person, eq(person.id, guestLink.guestPersonId))
    .where(and(eq(guestLink.employeeId, employeeId), eq(guestLink.status, "ACTIVE")))
    .orderBy(asc(guestLink.createdAt))
    .limit(1);
  const checkIns = await loadActiveCheckIns(ex, guestRow ? [row.person.id, guestRow.personId] : [row.person.id]);
  return {
    id: row.id,
    jobTitle: row.jobTitle,
    category: row.category,
    active: !row.removedAt,
    person: row.person,
    checkIn: checkIns.get(row.person.id) ?? null,
    guest: guestRow ? { ...guestRow, checkIn: checkIns.get(guestRow.personId) ?? null } : null,
    deliveries: await loadEmployeeDeliveries(ex, employeeId),
  };
}

export async function findEmployeeIdByPerson(ex: Executor, personId: string) {
  const [row] = await ex.select({ id: employee.id }).from(employee).where(eq(employee.personId, personId)).limit(1);
  return row?.id ?? null;
}

/** Arquivos (sem o conteúdo) anexados à ficha. */
export async function loadFormFiles(ex: Executor, formId: string): Promise<FormFile[]> {
  const rows = await ex
    .select({ id: affiliationDocument.id, kind: affiliationDocument.kind, contentType: affiliationDocument.contentType })
    .from(affiliationDocument)
    .where(eq(affiliationDocument.formId, formId))
    .orderBy(asc(affiliationDocument.createdAt));
  return rows.map((row) => ({ id: row.id, kind: row.kind, isPdf: row.contentType === "application/pdf" }));
}

export function documentCounts(files: FormFile[]): DocumentCounts {
  const counts: DocumentCounts = { RG: 0, PAYSLIP: 0 };
  for (const file of files) counts[file.kind] += 1;
  return counts;
}

export async function loadRegistrationState(
  ex: Executor,
  registrationId: string,
): Promise<RegistrationState | null> {
  const statusUser = alias(user, "status_user");
  const [row] = await ex
    .select({
      id: registration.id,
      status: registration.status,
      isTeacher: registration.isTeacher,
      origin: registration.origin,
      createdAt: registration.createdAt,
      statusChangedAt: registration.statusChangedAt,
      statusChangedByName: statusUser.name,
      statusNote: registration.statusNote,
      member: personColumns,
    })
    .from(registration)
    .innerJoin(person, eq(person.id, registration.memberPersonId))
    .leftJoin(statusUser, eq(statusUser.id, registration.statusChangedByUserId))
    .where(eq(registration.id, registrationId))
    .limit(1);
  if (!row) return null;

  const guests = await ex
    .select({
      guestLinkId: guestLink.id,
      addedAt: guestLink.createdAt,
      personId: person.id,
      fullName: person.fullName,
      cpf: person.cpf,
      isMinor: person.isMinor,
    })
    .from(guestLink)
    .innerJoin(person, eq(person.id, guestLink.guestPersonId))
    .where(and(eq(guestLink.registrationId, registrationId), eq(guestLink.status, "ACTIVE")))
    .orderBy(asc(guestLink.createdAt))
    .limit(1);

  const guestRow = guests[0];
  const checkIns = await loadActiveCheckIns(ex, guestRow ? [row.member.id, guestRow.personId] : [row.member.id]);
  const deliveries = await loadDeliveries(ex, registrationId);
  // Kit que a pessoa recebeu como convidado(a) de outro grupo (de professor(a) ou de funcionário(a)).
  const [kitAsGuest] = await ex
    .select({ id: kitDelivery.id })
    .from(kitDelivery)
    .where(
      and(
        eq(kitDelivery.beneficiaryPersonId, row.member.id),
        eq(kitDelivery.kitType, "GUEST"),
        or(isNull(kitDelivery.registrationId), ne(kitDelivery.registrationId, registrationId)),
        isNull(kitDelivery.cancelledAt),
      ),
    )
    .limit(1);

  return {
    id: row.id,
    status: row.status,
    isTeacher: row.isTeacher,
    origin: row.origin,
    createdAt: row.createdAt,
    statusChangedAt: row.statusChangedAt,
    statusChangedByName: row.statusChangedByName,
    statusNote: row.statusNote,
    member: row.member,
    memberCheckIn: checkIns.get(row.member.id) ?? null,
    guest: guestRow ? { ...guestRow, checkIn: checkIns.get(guestRow.personId) ?? null } : null,
    deliveries,
    memberReceivedGuestKit: Boolean(kitAsGuest),
  };
}

export async function findRegistrationIdByMember(ex: Executor, personId: string) {
  const [row] = await ex
    .select({ id: registration.id, status: registration.status })
    .from(registration)
    .where(eq(registration.memberPersonId, personId))
    .limit(1);
  return row ?? null;
}

/** Vínculo de convidado ativo da pessoa: com um(a) professor(a) (registrationId) ou um(a) funcionário(a) (employeeId). */
export async function findActiveGuestLink(ex: Executor, personId: string) {
  const [row] = await ex
    .select({
      id: guestLink.id,
      registrationId: guestLink.registrationId,
      employeeId: guestLink.employeeId,
      createdAt: guestLink.createdAt,
    })
    .from(guestLink)
    .where(and(eq(guestLink.guestPersonId, personId), eq(guestLink.status, "ACTIVE")))
    .limit(1);
  return row ?? null;
}

export async function loadPersonState(ex: Executor, personId: string): Promise<PersonState | null> {
  const [basics] = await ex.select(personColumns).from(person).where(eq(person.id, personId)).limit(1);
  if (!basics) return null;

  const own = await findRegistrationIdByMember(ex, personId);
  const ownRegistration = own ? await loadRegistrationState(ex, own.id) : null;

  const activeLink = await findActiveGuestLink(ex, personId);
  let guestOf: GuestOfState | null = null;
  let guestOfEmployee: GuestOfEmployeeState | null = null;
  if (activeLink?.registrationId) {
    const host = await loadRegistrationState(ex, activeLink.registrationId);
    if (host) guestOf = { guestLinkId: activeLink.id, addedAt: activeLink.createdAt, host };
  } else if (activeLink?.employeeId) {
    const host = await loadEmployeeGroup(ex, activeLink.employeeId);
    if (host) guestOfEmployee = { guestLinkId: activeLink.id, addedAt: activeLink.createdAt, host };
  }

  const hostMember = alias(person, "host_member");
  const hostEmployeePerson = alias(person, "host_employee_person");
  const past = await ex
    .select({
      guestLinkId: guestLink.id,
      status: guestLink.status,
      hostMemberName: hostMember.fullName,
      hostEmployeeName: hostEmployeePerson.fullName,
      hostRegistrationId: guestLink.registrationId,
      addedAt: guestLink.createdAt,
      endedAt: guestLink.endedAt,
      endReason: guestLink.endReason,
    })
    .from(guestLink)
    .leftJoin(registration, eq(registration.id, guestLink.registrationId))
    .leftJoin(hostMember, eq(hostMember.id, registration.memberPersonId))
    .leftJoin(employee, eq(employee.id, guestLink.employeeId))
    .leftJoin(hostEmployeePerson, eq(hostEmployeePerson.id, employee.personId))
    .where(and(eq(guestLink.guestPersonId, personId), ne(guestLink.status, "ACTIVE")))
    .orderBy(desc(guestLink.createdAt));

  const checkIns = await loadActiveCheckIns(ex, [personId]);

  const [activeVoucher] = await ex
    .select({ id: voucher.id, code: voucher.code, issuedAt: voucher.issuedAt })
    .from(voucher)
    .where(and(eq(voucher.personId, personId), isNull(voucher.revokedAt)))
    .limit(1);

  const [openForm] = await ex
    .select({ id: affiliationForm.id, status: affiliationForm.status, origin: affiliationForm.origin })
    .from(affiliationForm)
    .where(and(eq(affiliationForm.personId, personId), inArray(affiliationForm.status, ["DRAFT", "FORMALIZED"])))
    .limit(1);
  const files = openForm ? await loadFormFiles(ex, openForm.id) : [];

  const employeeId = await findEmployeeIdByPerson(ex, personId);

  return {
    person: basics,
    checkIn: checkIns.get(personId) ?? null,
    voucher: activeVoucher ?? null,
    ownRegistration,
    guestOf,
    guestOfEmployee,
    pastGuestLinks: past.map(({ hostMemberName, hostEmployeeName, ...p }) => ({
      ...p,
      status: p.status as "REMOVED" | "CONVERTED",
      hostName: hostMemberName ?? hostEmployeeName ?? "—",
      hostIsEmployee: !p.hostRegistrationId,
    })),
    openAffiliationForm: openForm
      ? {
          id: openForm.id,
          status: openForm.status as "DRAFT" | "FORMALIZED",
          origin: openForm.origin,
          documents: documentCounts(files),
          files,
        }
      : null,
    employee: employeeId ? await loadEmployeeGroup(ex, employeeId) : null,
  };
}
