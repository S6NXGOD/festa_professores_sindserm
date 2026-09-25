/**
 * O que muda com o relógio: fim das inscrições pelo site, horário limite dos kits
 * mudado depois de passar e o placar antes da festa começar.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ROLE_PRESETS } from "@/domain/access";
import { eventSettingsSchema } from "@/domain/schemas";
import { utcToZonedLocalInput } from "@/lib/datetime";
import { db } from "@/server/db";
import { eventConfig } from "@/server/db/schema";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { createEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { buildGateView } from "@/server/services/gate-view";
import { deliverKit } from "@/server/services/kits";
import { createPreAffiliation, createRegistration } from "@/server/services/registration";
import { getEventConfig, getStockOverview, registrationWindow, updateEventSettings } from "@/server/services/settings";
import { loadPersonState } from "@/server/services/state";
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

describe("horário limite dos kits mudado depois de passar", () => {
  it("vale na hora: quem entrou sem kit recebe pelo 'Entregar agora' e quem chega depois já leva", async () => {
    const event = { eventDate: "2026-10-15", startTime: "19:00", kitDeadlineTime: "22:00" };
    await configureEvent(admin, event);
    const host = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });

    // 22h de 15/10 em São Paulo = 01h UTC de 16/10. Às 22h30 o horário já passou.
    const late = new Date("2026-10-16T01:30:00Z");
    const entry = await registerCheckIn(security, { personId: host.state.member.id, method: "SEARCH" }, late);
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "NONE", message: "Sem kit: o horário de entregar kits já passou." } });
    await expectDomainError(deliverKit(attendant, { personId: host.state.member.id, kitType: "MEMBER" }, late), "KIT_NOT_AVAILABLE");

    // O administrador muda para 23h (mesmo formulário de Configurações).
    const now = Date.now();
    await updateEventSettings(
      admin,
      eventSettingsSchema.parse({
        name: "Festa das Professoras e Professores",
        description: "",
        eventDate: event.eventDate,
        startTime: event.startTime,
        endTime: "",
        registrationOpensAt: utcToZonedLocalInput(new Date(now - 2 * 86_400_000)),
        registrationClosesAt: utcToZonedLocalInput(new Date(now + 2 * 86_400_000)),
        kitDeadlineTime: "23:00",
      }),
    );

    // A tela da pessoa volta a oferecer o kit que não saiu...
    const [state, config, stock] = await Promise.all([loadPersonState(db, host.state.member.id), getEventConfig(db), getStockOverview(db)]);
    const view = buildGateView(state!, ROLE_PRESETS.ATTENDANT, config, late, stock);
    expect(view.ownRegistration?.kits.MEMBER).toEqual({ kind: "AVAILABLE" });
    // ...e o "Entregar agora" funciona.
    expect(await deliverKit(attendant, { personId: host.state.member.id, kitType: "MEMBER" }, late)).toMatchObject({ kitType: "MEMBER" });
    // Quem chega depois disso já sai com o kit na entrada.
    const guest = await registerCheckIn(security, { personId: host.state.guest!.personId, method: "SEARCH" }, late);
    expect(guest).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DELIVERED", kitType: "GUEST" } });
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

    await decideAffiliation(attendant, { registrationId: pendente.registrationId, decision: "CONFIRM" });
    stats = await getDashboardStats(db);
    expect(stats).toMatchObject({ expected: 6, ready: 6 });
  });
});
