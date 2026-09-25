import { randomInt, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import {
  type AffiliationFormInput,
  eventSettingsSchema,
  type PreAffiliationInput,
  type RegistrationInput,
  stockSettingsSchema,
} from "@/domain/schemas";
import type { StaffRole } from "@/domain/types";
import { utcToZonedLocalInput } from "@/lib/datetime";
import { type Actor, PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { storeDocument } from "@/server/services/documents";
import { createPreAffiliation, createRegistration } from "@/server/services/registration";
import { completeSetup } from "@/server/services/settings";
import { loadRegistrationState } from "@/server/services/state";

export async function resetDatabase() {
  await db.execute(sql`
    TRUNCATE TABLE audit_log, rate_limit, kit_delivery, check_in, voucher, employee, affiliation_document,
      affiliation_form, guest_link, registration, person, kit_stock, event_photo, event_config,
      verification, session, account, "user"
    RESTART IDENTITY CASCADE
  `);
}

/** PDF mínimo (o servidor só confere o cabeçalho e guarda como veio). */
export const TEST_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");

/** Envia RG e contracheque como o formulário público faz (ainda sem ficha). */
export async function uploadTestDocuments(actor: Actor = PUBLIC_ACTOR) {
  const rg = await storeDocument(actor, { kind: "RG", bytes: TEST_PDF, type: "application/pdf" });
  const payslip = await storeDocument(actor, { kind: "PAYSLIP", bytes: TEST_PDF, type: "application/pdf" });
  return { rg: [rg.id], payslip: [payslip.id] };
}

/** Anexa RG e contracheque a uma ficha já gravada (como o Atendimento faz na recepção). */
export async function attachTestDocuments(actor: StaffActor, formId: string) {
  for (const kind of ["RG", "PAYSLIP"] as const) {
    await storeDocument(actor, { kind, bytes: TEST_PDF, type: "application/pdf", formId });
  }
}

export async function withUploadedDocuments(input: PreAffiliationInput): Promise<PreAffiliationInput> {
  return { ...input, documents: await uploadTestDocuments() };
}

const NAMES = ["Alfa", "Bravo", "Carla", "Daniel", "Elisa", "Fabio", "Gabriela", "Heitor", "Iara", "Joana", "Karina", "Lucas"];

export function personName(index: number, prefix = "Convidado") {
  return `${prefix} ${NAMES[index % NAMES.length]} ${NAMES[(index + 3) % NAMES.length]}`;
}

/** Gera um CPF válido e aleatório. */
export function randomCpf(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (digits.every((d) => d === digits[0])) digits[0] = (digits[0]! + 1) % 10;
  const check = (base: number[]) => {
    const sum = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  digits.push(check(digits));
  digits.push(check(digits));
  return digits.join("");
}

let matriculaCounter = 0;
/** Matrícula única (chave única da prefeitura). */
export function randomMatricula(): string {
  return `${randomInt(100, 999)}${String(++matriculaCounter).padStart(4, "0")}-${randomInt(0, 9)}`;
}

let staffCounter = 0;
export async function createStaff(role: StaffRole, name?: string): Promise<StaffActor> {
  const id = randomUUID();
  const displayName = name ?? `Operador ${role.toLowerCase()} ${++staffCounter}`;
  await db.insert(user).values({
    id,
    name: displayName,
    email: `${role.toLowerCase()}.${id.slice(0, 8)}@teste.local`,
    emailVerified: true,
    role,
  });
  return { kind: "staff", userId: id, name: displayName, role };
}

export async function configureEvent(
  admin: StaffActor,
  options: {
    stockMode?: "SINGLE" | "SPLIT";
    totalAll?: number;
    totalMember?: number;
    totalGuest?: number;
    totalEmployee?: number;
    lowStockThreshold?: number;
    eventDate?: string;
    startTime?: string;
    kitDeadlineTime?: string;
  } = {},
) {
  const now = Date.now();
  await completeSetup(admin, {
    event: eventSettingsSchema.parse({
      name: "Festa das Professoras e Professores",
      description: "",
      eventDate: options.eventDate ?? "2026-10-15",
      startTime: options.startTime ?? "19:00",
      endTime: "",
      registrationOpensAt: utcToZonedLocalInput(new Date(now - 2 * 86_400_000)),
      registrationClosesAt: utcToZonedLocalInput(new Date(now + 2 * 86_400_000)),
      kitDeadlineTime: options.kitDeadlineTime ?? "",
    }),
    stock: stockSettingsSchema.parse({
      stockMode: options.stockMode ?? "SINGLE",
      totalAll: options.totalAll ?? 100,
      totalMember: options.totalMember,
      totalGuest: options.totalGuest,
      totalEmployee: options.totalEmployee,
      lowStockThreshold: options.lowStockThreshold ?? 5,
    }),
  });
}

export interface MemberOptions {
  guest?: boolean;
  isTeacher?: boolean;
  memberCpf?: string;
  memberName?: string;
  guestCpf?: string;
  guestName?: string;
  registrationNumber?: string;
}

export function registrationInput(options: MemberOptions = {}): RegistrationInput {
  return {
    submissionId: randomUUID(),
    member: {
      fullName: options.memberName ?? "Maria Filiada Silva",
      cpf: options.memberCpf ?? randomCpf(),
      whatsapp: "(86) 99999-8888",
      registrationNumber: options.registrationNumber ?? randomMatricula(),
      workplace: "Escola Municipal Centro",
    },
    isTeacher: options.isTeacher ?? true,
    guest: options.guest
      ? { fullName: options.guestName ?? personName(0), cpf: options.guestCpf ?? randomCpf(), isMinor: false }
      : null,
    privacyConsent: true,
  };
}

export async function registerMember(options: MemberOptions & { actor?: Actor } = {}) {
  const input = registrationInput(options);
  const created = await createRegistration(options.actor ?? PUBLIC_ACTOR, input);
  const state = await loadRegistrationState(db, created.registrationId);
  if (!state) throw new Error("Inscrição não encontrada após criação");
  return { ...created, state, input };
}

/** Campos da ficha de filiação (mesmos da ficha impressa). */
export function fichaFields(options: { cpf?: string; fullName?: string; registrationNumber?: string } = {}) {
  return {
    fullName: options.fullName ?? "Rafaela Nova Filiada",
    motherName: "Ana Maria Souza",
    fatherName: "",
    address: "Rua das Flores",
    addressNumber: "100",
    neighborhood: "Centro",
    email: "",
    whatsapp: "86988887777",
    birthDate: "1990-05-10",
    rg: "1234567",
    cpf: options.cpf ?? randomCpf(),
    workplace: "Escola Municipal Norte",
    registrationNumber: options.registrationNumber ?? randomMatricula(),
    jobTitle: "Professora",
    admissionDate: "2015-03-01",
    contributionStartMonth: "2026-11",
  };
}

/** Ficha preenchida pelo Atendimento para uma pessoa (existente ou nova). */
export function staffFicha(options: {
  personId?: string | null;
  cpf: string;
  fullName: string;
  isTeacher?: boolean;
  registrationNumber?: string;
}): AffiliationFormInput {
  return {
    ...fichaFields(options),
    personId: options.personId ?? null,
    formDate: "2026-10-15",
    isTeacher: options.isTeacher ?? true,
    authorizationAccepted: true,
  };
}

/**
 * Ficha do formulário público. Os documentos são ids de envio: use
 * `withUploadedDocuments` quando a ficha for gravada de verdade.
 */
export function preAffiliationInput(options: { isTeacher?: boolean; guest?: boolean; cpf?: string; fullName?: string } = {}): PreAffiliationInput {
  return {
    submissionId: randomUUID(),
    ficha: fichaFields(options),
    isTeacher: options.isTeacher ?? true,
    guest: options.guest ? { fullName: personName(1), cpf: randomCpf(), isMinor: false } : null,
    authorizationAccepted: true,
    documents: { rg: [randomUUID()], payslip: [randomUUID()] },
    privacyConsent: true,
  };
}

export async function registerPreAffiliation(options: Parameters<typeof preAffiliationInput>[0] = {}) {
  const input = await withUploadedDocuments(preAffiliationInput(options));
  const created = await createPreAffiliation(PUBLIC_ACTOR, input);
  const state = await loadRegistrationState(db, created.registrationId);
  if (!state) throw new Error("Inscrição não encontrada após criação");
  return { ...created, state, input };
}

export async function reload(registrationId: string) {
  const state = await loadRegistrationState(db, registrationId);
  if (!state) throw new Error("Inscrição não encontrada");
  return state;
}
