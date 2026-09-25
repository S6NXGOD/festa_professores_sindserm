/**
 * Regras complementares: período de inscrições, idempotência, correções
 * administrativas, mascaramento de CPF, conversão de convidado, bootstrap e usuários.
 */
import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, eventConfig, guestLink, kitDelivery, kitStock, person, registration, session, user } from "@/server/db/schema";
import { helpSettingsSchema } from "@/domain/schemas";
import { whatsappLink } from "@/lib/phone";
import { updateHelpSettings } from "@/server/services/settings";
import { decideAffiliation, reopenAffiliation } from "@/server/services/affiliation";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { cancelCheckIn, registerCheckIn } from "@/server/services/checkin";
import { DomainError } from "@/server/services/errors";
import { buildGateView } from "@/server/services/gate-view";
import { addGuest, removeGuest } from "@/server/services/group";
import { cancelKitDelivery, deliverKit } from "@/server/services/kits";
import { registerDeclaredMember } from "@/server/services/membership";
import { createRegistration } from "@/server/services/registration";
import { loadPersonState } from "@/server/services/state";
import { bootstrapFirstAdmin, createStaffUser, updateStaffUser } from "@/server/services/users";
import { configureEvent, createStaff, randomCpf, registerMember, registrationInput, reload, resetDatabase } from "../helpers/factories";

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

describe("formulário público", () => {
  it("fica fechado antes do setup e fora do período de inscrições", async () => {
    await expectDomainError(createRegistration(PUBLIC_ACTOR, registrationInput()), "REGISTRATION_CLOSED");
    await configureEvent(admin);
    await db
      .update(eventConfig)
      .set({ registrationOpensAt: new Date(Date.now() + 86_400_000), registrationClosesAt: new Date(Date.now() + 2 * 86_400_000) })
      .where(eq(eventConfig.id, 1));
    await expectDomainError(createRegistration(PUBLIC_ACTOR, registrationInput()), "REGISTRATION_CLOSED");
    // O atendimento cadastra na hora mesmo fora do período.
    const staff = await createRegistration(attendant, registrationInput({ guest: true }));
    expect(staff.registrationId).toBeTruthy();
  });

  it("WhatsApp de ajuda: o administrador cadastra, troca e tira; número inválido é recusado", async () => {
    await configureEvent(admin);
    const helpOf = async () => (await db.select({ help: eventConfig.helpWhatsapp }).from(eventConfig))[0]?.help;
    expect(helpSettingsSchema.safeParse({ helpWhatsapp: "(86) 1234" }).success).toBe(false);
    await expectDomainError(updateHelpSettings(attendant, helpSettingsSchema.parse({ helpWhatsapp: "86 99536-1455" })), "FORBIDDEN");

    await updateHelpSettings(admin, helpSettingsSchema.parse({ helpWhatsapp: "(86) 9536-1455" }));
    expect(await helpOf()).toBe("8695361455");
    await updateHelpSettings(admin, helpSettingsSchema.parse({ helpWhatsapp: "" }));
    expect(await helpOf()).toBeNull();
    const audits = await db.select({ summary: auditLog.summary }).from(auditLog).where(eq(auditLog.action, "HELP_CONTACT_UPDATED"));
    expect(audits.map((a) => a.summary)).toEqual(["WhatsApp de ajuda atualizado.", "WhatsApp de ajuda removido."]);
    expect(whatsappLink("8695361455", "Oi")).toBe("https://wa.me/558695361455?text=Oi");
  });

  it("reenvio do mesmo formulário não duplica a inscrição", async () => {
    await configureEvent(admin);
    const input = registrationInput({ guest: true });
    const first = await createRegistration(PUBLIC_ACTOR, input);
    const second = await createRegistration(PUBLIC_ACTOR, input);
    expect(second.reused).toBe(true);
    expect(second.registrationId).toBe(first.registrationId);
    expect(second.accessToken).not.toBe(first.accessToken);
    const [people] = await db.select({ total: count() }).from(person);
    expect(people!.total).toBe(2);
  });
});

describe("portaria", () => {
  beforeEach(() => configureEvent(admin));

  it("Segurança vê CPF mascarado; Atendimento vê completo", async () => {
    const { state, input } = await registerMember();
    const personState = await loadPersonState(db, state.member.id);
    expect(buildGateView(personState!, "SECURITY", null).cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    expect(buildGateView(personState!, "ATTENDANT", null).cpf!.replace(/\D/g, "")).toBe(input.member.cpf);
    expect(buildGateView(personState!, "SECURITY", null).permissions.deliverKits).toBe(false);
  });

  it("convidado de filiado pendente não entra até a conferência do responsável", async () => {
    const { state, registrationId } = await registerMember({ guest: true });
    const guest = state.guest!;
    await expectDomainError(registerCheckIn(security, { personId: guest.personId, method: "SEARCH" }), "ENTRY_BLOCKED");
    await decideAffiliation(attendant, { registrationId, decision: "CONFIRM" });
    const result = await registerCheckIn(security, { personId: guest.personId, method: "SEARCH" });
    expect(result.outcome).toBe("CHECKED_IN");
  });
});

describe("correções administrativas", () => {
  beforeEach(() => configureEvent(admin, { stockMode: "SINGLE", totalAll: 1, lowStockThreshold: 0 }));

  it("estorno de entrega devolve o kit ao estoque e só o ADMIN pode estornar", async () => {
    const { registrationId, state } = await registerMember();
    await decideAffiliation(attendant, { registrationId, decision: "CONFIRM" });
    const entry = await registerCheckIn(security, { personId: state.member.id, method: "SEARCH" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DELIVERED", available: 0 } });
    const [delivery] = await db.select({ id: kitDelivery.id }).from(kitDelivery).where(eq(kitDelivery.registrationId, registrationId));

    await expectDomainError(
      cancelKitDelivery(attendant, { deliveryId: delivery!.id, justification: "Entrega registrada por engano" }),
      "FORBIDDEN",
    );
    await cancelKitDelivery(admin, { deliveryId: delivery!.id, justification: "Entrega registrada por engano" });
    const [stock] = await db.select().from(kitStock).where(eq(kitStock.pool, "ALL"));
    expect(stock).toMatchObject({ total: 1, delivered: 0 });
    // A pessoa continua lá dentro: o kit pode sair pela entrega manual.
    const again = await deliverKit(attendant, { personId: state.member.id, kitType: "MEMBER" });
    expect(again.stock.delivered).toBe(1);
  });

  it("estornar a entrada devolve o kit que saiu com ela", async () => {
    const { registrationId, state } = await registerMember();
    await decideAffiliation(attendant, { registrationId, decision: "CONFIRM" });
    await registerCheckIn(security, { personId: state.member.id, method: "SEARCH" });
    await expectDomainError(
      cancelCheckIn(attendant, { personId: state.member.id, justification: "Entrada registrada por engano" }),
      "FORBIDDEN",
    );
    const result = await cancelCheckIn(admin, { personId: state.member.id, justification: "Entrada registrada por engano" });
    expect(result.kitsReturned).toBe(1);
    const [stock] = await db.select().from(kitStock).where(eq(kitStock.pool, "ALL"));
    expect(stock).toMatchObject({ total: 1, delivered: 0 });
    expect((await reload(registrationId)).deliveries.MEMBER).toBeUndefined();
  });

  it("reabrir conferência é bloqueado após entrega de kit", async () => {
    const { registrationId, state } = await registerMember();
    await decideAffiliation(attendant, { registrationId, decision: "CONFIRM" });
    await registerCheckIn(security, { personId: state.member.id, method: "SEARCH" });
    await expectDomainError(
      reopenAffiliation(admin, { registrationId, justification: "Conferência feita por engano" }),
      "INVALID_STATE",
    );
  });
});

describe("gestão de convidados", () => {
  beforeEach(() => configureEvent(admin));

  it("remover o convidado mantém o histórico e cancela o QR de quem só era convidado", async () => {
    const { state, registrationId } = await registerMember({ guest: true });
    const guest = state.guest!;
    await removeGuest(attendant, { guestLinkId: guest.guestLinkId });
    expect((await reload(registrationId)).guest).toBeNull();
    const [removed] = await db.select().from(guestLink).where(eq(guestLink.id, guest.guestLinkId));
    expect(removed!.status).toBe("REMOVED");
    const personState = await loadPersonState(db, guest.personId);
    expect(personState?.voucher).toBeNull();
  });

  it("filiação rejeitada não aceita novos convidados", async () => {
    const { registrationId } = await registerMember();
    await decideAffiliation(attendant, { registrationId, decision: "REJECT" });
    await expectDomainError(
      addGuest(attendant, { registrationId, fullName: "Nova Convidada Silva", cpf: randomCpf(), isMinor: false }),
      "INVALID_STATE",
    );
  });

  it("convidado que já era filiado ganha inscrição pendente sem duplicar a pessoa", async () => {
    const host = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    const guest = host.state.guest!;
    const result = await registerDeclaredMember(attendant, {
      personId: guest.personId,
      whatsapp: "86999990000",
      registrationNumber: "4455",
      workplace: "Escola Municipal Leste",
      isTeacher: true,
    });
    const [reg] = await db.select().from(registration).where(eq(registration.id, result.registrationId));
    expect(reg).toMatchObject({ memberPersonId: guest.personId, status: "PENDING", origin: "GUEST_CONVERSION" });
    // O benefício só é liberado quando a filiação for confirmada (ver casos-limite.test.ts).
    expect((await reload(host.registrationId)).guest?.personId).toBe(guest.personId);
    const [people] = await db.select({ total: count() }).from(person).where(eq(person.cpf, guest.cpf!));
    expect(people!.total).toBe(1);
  });
});

describe("usuários e primeiro acesso", () => {
  it("bootstrap exige o token e só funciona sem usuários", async () => {
    await resetDatabase();
    const input = { name: "Primeira Admin Silva", email: "primeira@teste.local", password: "senha-forte-123", passwordConfirmation: "senha-forte-123" };
    await expectDomainError(bootstrapFirstAdmin({ ...input, setupToken: "token-errado-000000" }), "FORBIDDEN");
    const created = await bootstrapFirstAdmin({ ...input, setupToken: process.env.SETUP_TOKEN! });
    const [row] = await db.select().from(user).where(eq(user.id, created.userId));
    expect(row).toMatchObject({ role: "ADMIN", active: true });
    await expectDomainError(
      bootstrapFirstAdmin({ ...input, email: "outra@teste.local", setupToken: process.env.SETUP_TOKEN! }),
      "CONFLICT",
    );
  });

  it("não permite ficar sem administrador ativo e encerra sessões ao desativar", async () => {
    await expectDomainError(
      updateStaffUser(admin, { userId: admin.userId, name: admin.name, role: "ADMIN", active: false }),
      "INVALID_STATE",
    );
    const other = await createStaffUser(admin, {
      name: "Outro Usuario Teste",
      email: "outro@teste.local",
      role: "SECURITY",
      password: "senha-forte-123",
    });
    await db.insert(session).values({ id: "s1", token: "t1", userId: other.userId, expiresAt: new Date(Date.now() + 3_600_000) });
    await updateStaffUser(admin, { userId: other.userId, name: "Outro Usuario Teste", role: "SECURITY", active: false });
    const [remaining] = await db.select({ total: count() }).from(session).where(eq(session.userId, other.userId));
    expect(remaining!.total).toBe(0);
    await expectDomainError(
      createStaffUser(attendant, { name: "Sem Permissao Aqui", email: "x@teste.local", role: "ADMIN", password: "senha-forte-123" }),
      "FORBIDDEN",
    );
  });
});
