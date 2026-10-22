/**
 * Mudança entre festas (um sistema por festa): o pacote trancado com senha leva
 * a equipe (mesmo login, senha nova no primeiro acesso) e as filiações já
 * conferidas. Ninguém entra na festa nova por estar no pacote (tem gente da
 * festa passada que não vai na nova): quem já foi conferido(a) e se inscreve é
 * confirmado(a) na hora.
 */
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { account, auditLog, priorAffiliation, registration, user } from "@/server/db/schema";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { addCompanion, createEmployee, listEmployees } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import {
  type FestaPackage,
  exportFestaPackage,
  getPriorAffiliationOverview,
  importFestaPackage,
  openFestaPackage,
  previewFestaPackage,
  sealFestaPackage,
} from "@/server/services/festa-package";
import { getDashboardStats } from "@/server/services/stats";
import { registerDeclaredMember } from "@/server/services/membership";
import { createStaffUser } from "@/server/services/users";
import { configureEvent, createStaff, randomCpf, registerMember, resetDatabase } from "../helpers/factories";

const PASS = "verao-na-piscina-2026";
const SOURCE = "Festa das Professoras e Professores";

let admin: StaffActor;
let attendant: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  await configureEvent(admin);
});

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeInstanceOf(DomainError);
  return error as DomainError;
}

/** O sistema da outra festa: banco vazio, com o(a) administrador(a) de lá. */
async function otherParty() {
  await resetDatabase();
  const there = await createStaff("ADMIN", "Bia Administradora");
  await configureEvent(there);
  return there;
}

/** Filiação conferida nesta festa (o Atendimento confirmou). */
async function confirmedMember(fullName: string, cpf = randomCpf()) {
  const member = await registerMember({ memberName: fullName, memberCpf: cpf });
  await decideAffiliation(attendant, { registrationId: member.registrationId, decision: "CONFIRM" });
  return { ...member, cpf };
}

const statusOf = async (registrationId: string) =>
  (await db.select({ status: registration.status, note: registration.statusNote }).from(registration).where(eq(registration.id, registrationId)))[0];

describe("pacote de mudança entre festas", () => {
  it("leva a equipe com a mesma senha (nova no primeiro acesso) e só as filiações conferidas; colaboradores e cortesias não vão", async () => {
    await createStaffUser(admin, { name: "Sergio Seguranca", email: "sergio@teste.local", role: "SECURITY", password: "senha-forte-123" });
    const rosa = await createEmployee(admin, { fullName: "Rosa Financeiro Lima", cpf: "", whatsapp: "", jobTitle: "Financeiro", category: "STAFF", guest: null });
    await createEmployee(admin, { fullName: "Carla Mendes Silva", cpf: "", whatsapp: "", jobTitle: "Presidência", category: "COURTESY", withKit: false, isMinor: true, guest: null });
    await addCompanion(admin, { hostEmployeeId: rosa.employeeId, fullName: "Joana Amiga Rosa", cpf: "", isMinor: false });
    const maria = await confirmedMember("Maria Aparecida Souza");
    await registerMember({ memberName: "Pedro Pendente Alves" });

    const { content, counts } = await exportFestaPackage(admin, PASS);
    // Os 3 da equipe e só a filiação conferida (a pendente fica). Colaboradores e cortesias não vão.
    expect(counts).toEqual({ users: 3, affiliations: 1 });
    // Trancado: nada legível no arquivo.
    expect(content).not.toContain("Maria");
    expect(content).not.toContain(maria.cpf);
    expect(content).not.toContain("sergio@teste.local");
    const [exported] = await db.select().from(auditLog).where(eq(auditLog.action, "FESTA_PACKAGE_EXPORTED"));
    expect(exported?.summary).toBe("Pacote de mudança gerado: 3 da equipe e 1 filiação conferida.");

    const there = await otherParty();
    expect(await previewFestaPackage(there, content, PASS)).toMatchObject({ source: SOURCE, counts, usersAlreadyHere: 0 });

    const summary = await importFestaPackage(there, content, PASS);
    // Quem foi criado(a) sem senha de login (só nos testes) não vem.
    expect(summary).toEqual({
      source: SOURCE,
      users: { created: 1, skipped: 2 },
      affiliations: { added: 1, skipped: 0 },
    });

    const [sergio] = await db.select().from(user).where(eq(user.email, "sergio@teste.local"));
    expect(sergio).toMatchObject({ name: "Sergio Seguranca", role: "SECURITY", active: true, mustChangePassword: true });
    const [login] = await db.select().from(account).where(and(eq(account.userId, sergio!.id), eq(account.providerId, "credential")));
    expect(await verifyPassword({ hash: login!.password!, password: "senha-forte-123" })).toBe(true);

    // Ninguém entra na festa nova por estar no pacote: nem colaboradores, nem cortesias, nem inscrições.
    expect(await listEmployees(db, { kind: "all", includeRemoved: true })).toEqual([]);
    expect(await db.select().from(registration)).toEqual([]);
    expect(await getDashboardStats(db)).toMatchObject({ registrationsExpected: 0, organizationExpected: 0, expected: 0 });

    expect(await db.select().from(priorAffiliation)).toEqual([
      expect.objectContaining({ cpf: maria.cpf, fullName: "Maria Aparecida Souza", source: SOURCE }),
    ]);
    const [imported] = await db.select().from(auditLog).where(eq(auditLog.action, "FESTA_PACKAGE_IMPORTED"));
    expect(imported?.summary).toBe(`Pacote de mudança importado (${SOURCE}): 1 da equipe e 1 filiação conferida.`);
    expect(await getPriorAffiliationOverview(db)).toEqual({ total: 1, sources: [SOURCE], confirmedHere: 0 });

    // Importar de novo não duplica ninguém.
    expect(await importFestaPackage(there, content, PASS)).toMatchObject({
      users: { created: 0, skipped: 3 },
      affiliations: { added: 0, skipped: 1 },
    });
    expect((await previewFestaPackage(there, content, PASS)).usersAlreadyHere).toBe(1);
  });

  it("pacote antigo, que ainda trazia colaboradores e cortesias: essa parte é ignorada", async () => {
    const maria = await confirmedMember("Maria Aparecida Souza");
    const oldFormat = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: SOURCE,
      users: [],
      employees: [{ key: "a", fullName: "Rosa Financeiro Lima", cpf: null, whatsapp: null, isMinor: false, category: "STAFF", jobTitle: "Financeiro", withKit: true, hostKey: null }],
      affiliations: [{ cpf: maria.cpf, fullName: "Maria Aparecida Souza", registrationNumber: null, confirmedAt: new Date().toISOString() }],
    };
    const content = sealFestaPackage(oldFormat as unknown as FestaPackage, PASS);
    const there = await otherParty();
    expect(await previewFestaPackage(there, content, PASS)).toMatchObject({ counts: { users: 0, affiliations: 1 } });
    expect(await importFestaPackage(there, content, PASS)).toMatchObject({ affiliations: { added: 1, skipped: 0 } });
    expect(await listEmployees(db, { kind: "all", includeRemoved: true })).toEqual([]);
  });

  it("quem já foi conferido(a) se inscreve e é confirmado(a) na hora; com outro nome, fica para a conferência com o recado", async () => {
    const maria = await confirmedMember("Maria Aparecida Souza");
    const jose = await confirmedMember("José Antônio Lima");
    const { content } = await exportFestaPackage(admin, PASS);
    const there = await otherParty();
    await importFestaPackage(there, content, PASS);

    // Mesmo CPF, nome sem o do meio e em maiúsculas: confirmada na hora.
    const again = await registerMember({ memberCpf: maria.cpf, memberName: "MARIA SOUZA" });
    expect(await statusOf(again.registrationId)).toEqual({ status: "CONFIRMED", note: `Filiação já conferida na ${SOURCE} (RG e contracheque).` });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "AFFILIATION_PRIOR_CONFIRMED"));
    expect(audit?.summary).toBe(`Filiação de MARIA SOUZA confirmada na hora: já tinha sido conferida na ${SOURCE}.`);
    expect((await getPriorAffiliationOverview(db)).confirmedHere).toBe(1);

    // Mesmo CPF, outra pessoa no nome: a equipe confere o documento.
    const other = await registerMember({ memberCpf: jose.cpf, memberName: "Joaquim Pereira Costa" });
    expect(await statusOf(other.registrationId)).toEqual({
      status: "PENDING",
      note: `CPF com filiação conferida na ${SOURCE}, mas com outro nome (José Antônio Lima): confira o documento.`,
    });

    // Quem não veio no pacote segue a conferência de sempre.
    const fresh = await registerMember({ memberName: "Lucas Novo Filiado" });
    expect(await statusOf(fresh.registrationId)).toEqual({ status: "PENDING", note: null });
  });

  it("convidado(a) que se declara filiado(a) e já foi conferido(a): só o recado (o Confirmar da equipe desfaz o vínculo de convidado)", async () => {
    const cpf = randomCpf();
    await confirmedMember("Iara Convidada Rocha", cpf);
    const { content } = await exportFestaPackage(admin, PASS);
    const there = await otherParty();
    await importFestaPackage(there, content, PASS);

    const host = await registerMember({ guest: true, guestName: "Iara Convidada Rocha", guestCpf: cpf });
    await decideAffiliation(there, { registrationId: host.registrationId, decision: "CONFIRM" });
    const declared = await registerDeclaredMember(there, {
      personId: host.state.guest!.personId,
      whatsapp: "86999990000",
      registrationNumber: "4455-1",
      workplace: "Escola Municipal Leste",
      isTeacher: true,
    });
    expect(await statusOf(declared.registrationId)).toEqual({ status: "PENDING", note: `Filiação já conferida na ${SOURCE} (RG e contracheque): pode confirmar.` });
    const decision = await decideAffiliation(there, { registrationId: declared.registrationId, decision: "CONFIRM" });
    expect(decision.conversion).not.toBeNull();
  });

  it("senha errada, arquivo mexido ou que não é pacote, senha curta e quem não administra: recusa", async () => {
    await confirmedMember("Maria Aparecida Souza");
    const { content } = await exportFestaPackage(admin, PASS);

    expect((await refused(Promise.resolve().then(() => openFestaPackage(content, "outra-senha-123")))).message).toBe(
      "Senha do pacote errada (ou o arquivo foi alterado).",
    );
    const envelope = JSON.parse(content) as { data: string };
    const tampered = JSON.stringify({ ...JSON.parse(content), data: `${envelope.data.slice(0, -4)}AAAA` });
    expect((await refused(Promise.resolve().then(() => openFestaPackage(tampered, PASS)))).message).toBe(
      "Senha do pacote errada (ou o arquivo foi alterado).",
    );
    expect((await refused(Promise.resolve().then(() => openFestaPackage('{"nome":"planilha"}', PASS)))).message).toBe(
      "Este arquivo não é um pacote de festa.",
    );
    expect((await refused(exportFestaPackage(admin, "curta"))).message).toBe("A senha do pacote precisa ter pelo menos 8 caracteres.");
    expect((await refused(exportFestaPackage(attendant, PASS))).code).toBe("FORBIDDEN");
    expect((await refused(importFestaPackage(attendant, content, PASS))).code).toBe("FORBIDDEN");
    expect((await refused(previewFestaPackage(attendant, content, PASS))).code).toBe("FORBIDDEN");
  });
});
