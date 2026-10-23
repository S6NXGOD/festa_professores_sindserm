/**
 * O que muda com o relógio: fim das inscrições pelo site, os kits guardados até o
 * horário (depois, sobras por ordem de chegada) e o placar antes da festa começar.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ENTRY_KIT_MESSAGE } from "@/domain/labels";
import { db } from "@/server/db";
import { eventConfig } from "@/server/db/schema";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { createEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { createPreAffiliation, createRegistration } from "@/server/services/registration";
import { getEventConfig, registrationWindow } from "@/server/services/settings";
import { getDashboardStats } from "@/server/services/stats";
import {
  configureEvent,
  createStaff,
  preAffiliationInput,
  registerMember,
  registrationInput,
  resetDatabase,
  withUploadedDocuments,
} from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

async function expectDomainError(promise: Promise<unknown>, code: DomainError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `esperava erro ${code}`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
});

describe("fim das inscrições pelo site", () => {
  it("o site fecha (inscrição e ficha), a equipe continua cadastrando e a festa segue normal", async () => {
    await configureEvent(admin);
    const inscrita = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: inscrita.registrationId, decision: "CONFIRM" });

    // Encerramento no passado: acabou o período.
    await db
      .update(eventConfig)
      .set({ registrationOpensAt: new Date(Date.now() - 3 * 86_400_000), registrationClosesAt: new Date(Date.now() - 60_000) })
      .where(eq(eventConfig.id, 1));
    expect(registrationWindow(await getEventConfig(db)).state).toBe("CLOSED");

    await expectDomainError(createRegistration(PUBLIC_ACTOR, registrationInput()), "REGISTRATION_CLOSED");
    await expectDomainError(createPreAffiliation(PUBLIC_ACTOR, await withUploadedDocuments(preAffiliationInput())), "REGISTRATION_CLOSED");

    // Atendimento: "Cadastrar na hora" continua funcionando.
    const naHora = await createRegistration(attendant, registrationInput({ guest: false }));
    expect(naHora.registrationId).toBeTruthy();

    // Quem já tinha inscrição entra normalmente (voucher e portaria não dependem do período).
    expect((await registerCheckIn(security, { personId: inscrita.state.member.id, method: "SEARCH" })).outcome).toBe("CHECKED_IN");
    expect((await registerCheckIn(security, { personId: inscrita.state.guest!.personId, method: "SEARCH" })).outcome).toBe("CHECKED_IN");

    // O placar segue contando tudo.
    const stats = await getDashboardStats(db);
    expect(stats).toMatchObject({ registrations: 2, present: 2, confirmed: 1, pending: 1 });
  });
});

describe("kits guardados até o horário; depois, sobras por ordem de chegada", () => {
  it("antes do horário a fila espera; depois, quem entra leva o kit enquanto houver (inclusive da fila)", async () => {
    await configureEvent(admin, { eventDate: "2026-10-15", startTime: "19:00", kitDeadlineTime: "22:00", totalAll: 1, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Garantida Silva" });
    const bia = await registerMember({ memberName: "Bia Da Fila Souza" });
    const carla = await registerMember({ memberName: "Carla Da Fila Lima" });
    for (const reg of [ana, bia, carla]) await decideAffiliation(attendant, { registrationId: reg.registrationId, decision: "CONFIRM" });

    // 21h em São Paulo (00h UTC de 16/10): Carla, da fila, entra sem kit — o kit da Ana está guardado.
    const early = await registerCheckIn(security, { personId: carla.state.member.id, method: "SEARCH" }, new Date("2026-10-16T00:00:00Z"));
    expect(early).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.KIT_WAITLIST } });

    // 22h30: passou o horário dos kits guardados. Bia, da fila, leva a sobra (a Ana ainda não veio).
    const late = await registerCheckIn(security, { personId: bia.state.member.id, method: "SEARCH" }, new Date("2026-10-16T01:30:00Z"));
    expect(late).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DELIVERED", kitType: "MEMBER" } });

    // 22h40: Ana chega depois do horário e o kit já saiu (sobras por ordem de chegada).
    const anaLate = await registerCheckIn(security, { personId: ana.state.member.id, method: "SEARCH" }, new Date("2026-10-16T01:40:00Z"));
    expect(anaLate).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.OUT_OF_STOCK } });
  });
});

describe("placar antes da festa", () => {
  it("separa quem já pode entrar de quem ainda depende do Atendimento", async () => {
    await configureEvent(admin, { eventDate: "2026-12-20", startTime: "19:00", totalAll: 100, totalEmployee: 10 });
    const confirmada = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: confirmada.registrationId, decision: "CONFIRM" });
    const pendente = await registerMember({ guest: true });
    await createEmployee(admin, {
      fullName: "Rosa Colaboradora Lima",
      cpf: "",
      whatsapp: "",
      jobTitle: "Financeiro",
      category: "STAFF",
      guest: { fullName: "Caio Convidado Lima", cpf: "", isMinor: false },
    });

    // Esperados: 2 inscrições com convidado (4) + colaboradora com convidado (2).
    // Prontos: a confirmada e o convidado dela + os dois da colaboradora. A pendente e o convidado dela, não.
    let stats = await getDashboardStats(db);
    expect(stats).toMatchObject({ expected: 6, ready: 4, present: 0, pending: 1 });
    // A conta do placar: inscrições (4, 2 prontos) + organização (2, já liberados) = todo mundo.
    expect(stats).toMatchObject({ registrationsExpected: 4, registrationsReady: 2, organizationExpected: 2 });
    expect(stats.registrationsExpected + stats.organizationExpected).toBe(stats.expected);
    expect(stats.registrationsReady + stats.organizationExpected).toBe(stats.ready);

    await decideAffiliation(attendant, { registrationId: pendente.registrationId, decision: "CONFIRM" });
    stats = await getDashboardStats(db);
    expect(stats).toMatchObject({ expected: 6, ready: 6, registrationsExpected: 4, registrationsReady: 4 });
  });
});
