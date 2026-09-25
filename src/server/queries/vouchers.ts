import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/server/db";
import { voucher } from "@/server/db/schema";
import { isActiveMember } from "@/domain/rules";
import type { AffiliationStatus, EmployeeCategory } from "@/domain/types";
import { formatVoucherCode, qrPayloadFor } from "@/server/crypto";
import { findRegistrationByAccessToken } from "@/server/services/registration";
import { loadPersonState, loadRegistrationState, type PersonState } from "@/server/services/state";
import { findVoucherByToken, revealVoucherToken } from "@/server/services/vouchers";

export interface VoucherCardData {
  personId: string;
  token: string;
  code: string;
  qrSvg: string;
  fullName: string;
  /** EMPLOYEE: voucher de colaborador(a) do SINDSERM (visual próprio, com a categoria). */
  kind: "MEMBER" | "GUEST" | "EMPLOYEE";
  isMinor: boolean;
  checkedInAt: Date | null;
  /** Filiado(a) */
  affiliationStatus?: AffiliationStatus;
  isTeacher?: boolean;
  /** Filiado(a) ou funcionário(a): nome do convidado, se houver. */
  guestName?: string | null;
  /** Convidado */
  hostName?: string;
  /** Convidado de funcionário(a) do SINDSERM. */
  hostIsEmployee?: boolean;
  /** Funcionário(a): setor ou cargo no sindicato. */
  jobTitle?: string | null;
  /** Categoria do(a) colaborador(a) (diretoria, funcionário(a), prestador(a)). */
  category?: EmployeeCategory | null;
}

export async function qrSvgFor(token: string): Promise<string> {
  return QRCode.toString(qrPayloadFor(token), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}

export async function qrPngDataUrl(token: string, width = 560): Promise<string> {
  return QRCode.toDataURL(qrPayloadFor(token), {
    errorCorrectionLevel: "M",
    margin: 1,
    width,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}

async function activeVoucherRow(personId: string) {
  const [row] = await db
    .select({ id: voucher.id, code: voucher.code, tokenCiphertext: voucher.tokenCiphertext })
    .from(voucher)
    .where(and(eq(voucher.personId, personId), isNull(voucher.revokedAt)))
    .limit(1);
  return row ?? null;
}

async function cardFromState(state: PersonState, token: string, code: string): Promise<VoucherCardData> {
  const base = {
    personId: state.person.id,
    token,
    code: formatVoucherCode(code),
    qrSvg: await qrSvgFor(token),
    fullName: state.person.fullName,
    isMinor: state.person.isMinor,
    checkedInAt: state.checkIn?.checkedInAt ?? null,
  };
  if (state.employee?.active) {
    return {
      ...base,
      kind: "EMPLOYEE",
      jobTitle: state.employee.jobTitle,
      category: state.employee.category,
      guestName: state.employee.guest?.fullName ?? null,
    };
  }
  const own = state.ownRegistration;
  // Mesma regra da portaria: enquanto a filiação própria não estiver confirmada,
  // quem está vinculado a alguém participa como convidado.
  if (state.guestOf && !isActiveMember(own?.status)) {
    return { ...base, kind: "GUEST", hostName: state.guestOf.host.member.fullName };
  }
  if (state.guestOfEmployee && !isActiveMember(own?.status)) {
    return { ...base, kind: "GUEST", hostName: state.guestOfEmployee.host.person.fullName, hostIsEmployee: true };
  }
  return {
    ...base,
    kind: "MEMBER",
    affiliationStatus: own?.status,
    isTeacher: own?.isTeacher ?? false,
    guestName: own?.guest?.fullName ?? null,
  };
}

/** Voucher individual acessado pelo token do QR (link compartilhável). */
export async function loadVoucherByToken(token: string) {
  const found = await findVoucherByToken(db, token);
  if (!found) return { status: "NOT_FOUND" as const };
  if (found.revokedAt) return { status: "REVOKED" as const, revokedAt: found.revokedAt };
  const state = await loadPersonState(db, found.personId);
  if (!state) return { status: "NOT_FOUND" as const };
  return { status: "ACTIVE" as const, card: await cardFromState(state, token, found.code) };
}

/** Todos os vouchers do grupo, acessados pelo link do filiado. */
export async function loadGroupByAccessToken(accessToken: string) {
  const found = await findRegistrationByAccessToken(db, accessToken);
  if (!found) return null;
  const registration = await loadRegistrationState(db, found.id);
  if (!registration) return null;

  const people = [registration.member.id, ...(registration.guest ? [registration.guest.personId] : [])];
  const cards: VoucherCardData[] = [];
  for (const personId of people) {
    const [state, row] = await Promise.all([loadPersonState(db, personId), activeVoucherRow(personId)]);
    if (!state || !row) continue;
    cards.push(await cardFromState(state, revealVoucherToken(row), row.code));
  }
  return {
    registrationId: registration.id,
    status: registration.status,
    isTeacher: registration.isTeacher,
    memberName: registration.member.fullName,
    member: cards.find((c) => c.personId === registration.member.id) ?? null,
    guests: cards.filter((c) => c.personId !== registration.member.id),
  };
}

/** Para a equipe: voucher atual de uma pessoa (reimpressão na portaria). */
export async function loadVoucherForStaff(personId: string) {
  const [state, row] = await Promise.all([loadPersonState(db, personId), activeVoucherRow(personId)]);
  if (!state || !row) return null;
  return cardFromState(state, revealVoucherToken(row), row.code);
}

/**
 * Para a equipe: o voucher do(a) funcionário(a) e o do convidado dele(a), para
 * mandar os dois numa mensagem só.
 */
export async function loadEmployeeGroupVouchers(employeePersonId: string) {
  const state = await loadPersonState(db, employeePersonId);
  if (!state?.employee?.active) return null;
  const employeeCard = await loadVoucherForStaff(employeePersonId);
  const guestCard = state.employee.guest ? await loadVoucherForStaff(state.employee.guest.personId) : null;
  return { employee: employeeCard, guest: guestCard, whatsapp: state.person.whatsapp };
}
