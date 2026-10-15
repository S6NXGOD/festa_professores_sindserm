/**
 * Fila do kit (decisão da organização): os kits de professoras, professores e
 * convidados ficam com quem se inscreveu primeiro. Quem se inscreve quando o
 * estoque já está todo com os inscritos pode se inscrever, mas entra na fila
 * do kit (o site avisa e pede confirmação). Vagou kit, a fila anda por ordem.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ROLE_PRESETS } from "@/domain/access";
import { kitOutlook } from "@/domain/kit-supply";
import { ENTRY_KIT_MESSAGE } from "@/domain/labels";
import { stockSettingsSchema } from "@/domain/schemas";
import { db } from "@/server/db";
import { auditLog, eventConfig, kitStock, registration } from "@/server/db/schema";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { createEmployee } from "@/server/services/employees";
import { registerCheckIn } from "@/server/services/checkin";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { addGuest, removeGuest } from "@/server/services/group";
import { getKitSupply, kitWaitlistPositions } from "@/server/services/kit-waitlist";
import { deliverKit } from "@/server/services/kits";
import { createRegistration } from "@/server/services/registration";
import { updateStockSettings } from "@/server/services/settings";
import { getDashboardStats, getPeopleKitComparison } from "@/server/services/stats";
import {
  configureEvent,
  createStaff,
  personName,
  randomCpf,
  registerMember,
  registrationInput,
  reload,
  resetDatabase,
} from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
});

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeInstanceOf(DomainError);
  return error as DomainError;
}

async function stock(totalAll: number) {
  await updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll, lowStockThreshold: 0 }));
}

const waitlist = async (registrationId: string) => (await reload(registrationId)).kitWaitlist;

describe("fila do kit: quem se inscreve quando os kits acabaram", () => {
  it("o formulário sabe até quando os kits ficam guardados (e explica as sobras para quem entra na fila)", async () => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await configureEvent(admin, { totalAll: 3, lowStockThreshold: 0, eventDate: future, startTime: "19:00", kitDeadlineTime: "22:30" });
    expect((await getKitSupply(db))?.reservedUntil).toEqual({ label: "22:30", passed: false });
    // Sem horário: os kits ficam guardados a festa toda.
    await db.update(eventConfig).set({ kitDeadlineTime: null }).where(eq(eventConfig.id, 1));
    expect((await getKitSupply(db))?.reservedUntil).toBeNull();
  });

  it("estoque único: os primeiros garantem o kit; quem vem depois entra na fila, na ordem", async () => {
    await configureEvent(admin, { totalAll: 3, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    const bia = await registerMember({ memberName: "Bia Segunda Souza" });
    // Sobrou 1 kit: o da Bia. Carla e Duda já entram na fila.
    const carla = await registerMember({ memberName: "Carla Terceira Lima" });
    const duda = await registerMember({ memberName: "Duda Quarta Rocha" });

    expect(await waitlist(ana.registrationId)).toEqual({ MEMBER: null, GUEST: null });
    expect((await waitlist(bia.registrationId)).MEMBER).toBeNull();
    expect((await waitlist(carla.registrationId)).MEMBER).toBeInstanceOf(Date);
    expect(await kitWaitlistPositions(db, carla.registrationId)).toEqual({ MEMBER: 1, GUEST: null });
    expect(await kitWaitlistPositions(db, duda.registrationId)).toEqual({ MEMBER: 2, GUEST: null });

    // O formulário sabe: esgotado, 2 na fila.
    const supply = await getKitSupply(db);
    expect(supply).toMatchObject({ shared: true, member: 0, guest: 0, queue: { member: 2, guest: 2 } });
    expect(kitOutlook(supply, { teacher: true, guest: true })).toEqual({
      member: "WAITLIST",
      guest: "WAITLIST",
      position: { member: 3, guest: 4 },
    });

    // Painel: a previsão conta só os garantidos; a fila aparece à parte.
    const stats = await getDashboardStats(db);
    expect(stats.kitDemand).toMatchObject({ member: 2, guest: 1 });
    expect(stats.kitWaitlist).toEqual({ member: 2, guest: 0 });
    const comparison = await getPeopleKitComparison(db);
    expect(comparison.registrations[0]).toMatchObject({ id: "TEACHERS", people: 4, pending: 2, waitlist: 2 });

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, carla.registrationId), eq(auditLog.action, "KIT_WAITLISTED")));
    expect(audit?.summary).toBe("Kits esgotados: o de Carla Terceira Lima entrou na fila do kit.");
  });

  it("o último kit com convidado: fica com o(a) professor(a); o do convidado vai para a fila", async () => {
    await configureEvent(admin, { totalAll: 2, lowStockThreshold: 0 });
    await registerMember({ memberName: "Ana Primeira Silva" });
    const supply = await getKitSupply(db);
    expect(kitOutlook(supply, { teacher: true, guest: true })).toEqual({ member: "KIT", guest: "WAITLIST", position: { member: null, guest: 1 } });
    const bia = await registerMember({ memberName: "Bia Segunda Souza", guest: true });
    const state = await reload(bia.registrationId);
    expect(state.kitWaitlist.MEMBER).toBeNull();
    expect(state.kitWaitlist.GUEST).toBeInstanceOf(Date);
  });

  it("no site, a pessoa precisa confirmar que leu o aviso; pelo Atendimento, não", async () => {
    await configureEvent(admin, { totalAll: 1, lowStockThreshold: 0 });
    await registerMember({ memberName: "Ana Primeira Silva" });
    const input = { ...registrationInput({ memberName: "Bia Segunda Souza" }), acceptKitWaitlist: false };
    const error = await refused(createRegistration(PUBLIC_ACTOR, input));
    expect(error.code).toBe("KIT_WAITLIST");
    expect(error.fieldErrors).toMatchObject({ acceptKitWaitlist: expect.any(String) });
    // Nada ficou gravado.
    expect(await db.select().from(registration)).toHaveLength(1);

    const accepted = await createRegistration(PUBLIC_ACTOR, { ...input, acceptKitWaitlist: true });
    expect((await waitlist(accepted.registrationId)).MEMBER).toBeInstanceOf(Date);
    const byStaff = await createRegistration(attendant, { ...registrationInput({ memberName: "Carla Terceira Lima" }), acceptKitWaitlist: false });
    expect((await waitlist(byStaff.registrationId)).MEMBER).toBeInstanceOf(Date);
  });

  it("estoque dos inscritos zerado ou não cadastrado: sem fila (nada muda)", async () => {
    await configureEvent(admin, { totalAll: 0, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    expect(await waitlist(ana.registrationId)).toEqual({ MEMBER: null, GUEST: null });
    expect(await getKitSupply(db)).toMatchObject({ member: null, guest: null });
  });

  it("quem não é professor(a) nunca entra na fila (não tem kit)", async () => {
    await configureEvent(admin, { totalAll: 0, lowStockThreshold: 0 });
    await stock(1);
    await registerMember({ memberName: "Ana Primeira Silva" });
    const other = await registerMember({ memberName: "Bia Nao Professora", isTeacher: false });
    expect(await waitlist(other.registrationId)).toEqual({ MEMBER: null, GUEST: null });
  });

  it("estoque separado: cada kit na sua fila", async () => {
    await configureEvent(admin, { stockMode: "SPLIT", totalMember: 1, totalGuest: 1, lowStockThreshold: 0 });
    await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    const bia = await registerMember({ memberName: "Bia Segunda Souza", guest: true });
    expect(await kitWaitlistPositions(db, bia.registrationId)).toEqual({ MEMBER: 1, GUEST: 1 });
    expect(await getKitSupply(db)).toMatchObject({ shared: false, member: 0, guest: 0, queue: { member: 1, guest: 1 } });
  });
});

describe("a fila anda quando vaga kit", () => {
  it("filiação não confirmada libera os kits: o primeiro da fila ganha na hora", async () => {
    await configureEvent(admin, { totalAll: 1, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva" });
    const bia = await registerMember({ memberName: "Bia Segunda Souza" });
    const carla = await registerMember({ memberName: "Carla Terceira Lima" });
    await decideAffiliation(attendant, { registrationId: ana.registrationId, decision: "REJECT" });
    expect((await waitlist(bia.registrationId)).MEMBER).toBeNull();
    expect((await waitlist(carla.registrationId)).MEMBER).toBeInstanceOf(Date);
    const [promoted] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, bia.registrationId), eq(auditLog.action, "KIT_WAITLIST_PROMOTED")));
    expect(promoted?.summary).toBe("Vagou kit: Bia Segunda Souza saiu da fila e tem o kit garantido.");
  });

  it("mais kits no estoque: a fila anda na ordem, só até onde dá", async () => {
    await configureEvent(admin, { totalAll: 1, lowStockThreshold: 0 });
    await registerMember({ memberName: "Ana Primeira Silva" });
    const bia = await registerMember({ memberName: "Bia Segunda Souza" });
    const carla = await registerMember({ memberName: "Carla Terceira Lima" });
    expect(await updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll: 2, lowStockThreshold: 0 }))).toEqual({
      promoted: 1,
    });
    expect((await waitlist(bia.registrationId)).MEMBER).toBeNull();
    expect((await waitlist(carla.registrationId)).MEMBER).toBeInstanceOf(Date);
    expect(await kitWaitlistPositions(db, carla.registrationId)).toEqual({ MEMBER: 1, GUEST: null });
  });

  it("vaga que sobrou sem ninguém pegar vai para a fila antes de uma inscrição nova", async () => {
    await configureEvent(admin, { totalAll: 2, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    const bia = await registerMember({ memberName: "Bia Segunda Souza" });
    // O convidado da Ana sai: o kit dele vaga (sem ninguém ser promovido ainda).
    await removeGuest(attendant, { guestLinkId: ana.state.guest!.guestLinkId });
    const carla = await registerMember({ memberName: "Carla Terceira Lima" });
    // Bia esperava: ganhou o kit; Carla, que chegou agora, entra na fila.
    expect((await waitlist(bia.registrationId)).MEMBER).toBeNull();
    expect((await waitlist(carla.registrationId)).MEMBER).toBeInstanceOf(Date);
  });
});

describe("estoque único para todos", () => {
  it("juntar os estoques faz a fila andar; colaboradores tiram do geral e contam nos garantidos (sem ir para a fila)", async () => {
    await configureEvent(admin, { totalAll: 1, totalEmployee: 5, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva" });
    const bia = await registerMember({ memberName: "Bia Segunda Souza" });
    expect((await waitlist(bia.registrationId)).MEMBER).toBeInstanceOf(Date);
    const rosa = await createEmployee(admin, { fullName: "Rosa Financeiro Lima", cpf: "", whatsapp: "", jobTitle: "Financeiro", guest: null });

    // 1 geral + 5 dos colaboradores → um estoque só com 3: Ana + Rosa garantidas, sobra 1 para a Bia.
    expect(await updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "UNIFIED", totalAll: 3, lowStockThreshold: 0 }))).toEqual({
      promoted: 1,
    });
    expect((await waitlist(bia.registrationId)).MEMBER).toBeNull();
    expect(await db.select({ pool: kitStock.pool, total: kitStock.total }).from(kitStock)).toEqual([{ pool: "ALL", total: 3 }]);

    // O kit da colaboradora sai do estoque geral.
    const entry = await registerCheckIn(security, { personId: rosa.personId, method: "SEARCH" });
    expect(entry).toMatchObject({ kit: { kind: "DELIVERED", kitType: "EMPLOYEE", pool: "ALL" } });

    // Cheio (Ana, Bia e Rosa): quem chega agora vai para a fila; a lista interna, não.
    const carla = await registerMember({ memberName: "Carla Terceira Lima" });
    expect((await waitlist(carla.registrationId)).MEMBER).toBeInstanceOf(Date);
    expect(await getKitSupply(db)).toMatchObject({ shared: true, member: 0, queue: { member: 1 } });
    const stats = await getDashboardStats(db);
    expect(stats.stock?.pools).toEqual([expect.objectContaining({ pool: "ALL", total: 3, delivered: 1 })]);
    expect(stats.kitDemand).toMatchObject({ member: 2, employee: 1 });
    void ana;
  });
});

describe("convidado e fila", () => {
  it("convidado novo com os kits esgotados vai para a fila; a troca mantém a vaga; sem convidado, sai da fila", async () => {
    await configureEvent(admin, { totalAll: 2, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva" });
    await registerMember({ memberName: "Bia Segunda Souza" });
    const added = await addGuest(attendant, { registrationId: ana.registrationId, fullName: personName(1), cpf: randomCpf(), isMinor: false });
    expect((await waitlist(ana.registrationId)).GUEST).toBeInstanceOf(Date);
    const since = (await waitlist(ana.registrationId)).GUEST;

    await addGuest(attendant, {
      registrationId: ana.registrationId,
      fullName: personName(2),
      cpf: randomCpf(),
      isMinor: false,
      replaceGuestLinkId: added.guestLinkId,
    });
    expect((await waitlist(ana.registrationId)).GUEST).toEqual(since);

    const current = await reload(ana.registrationId);
    await removeGuest(attendant, { guestLinkId: current.guest!.guestLinkId });
    expect((await waitlist(ana.registrationId)).GUEST).toBeNull();
  });
});

describe("portaria", () => {
  it("antes das entradas, a portaria já vê que o kit do convidado está na fila (sem botão de sobra)", async () => {
    await configureEvent(admin, { totalAll: 1, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    await decideAffiliation(attendant, { registrationId: ana.registrationId, decision: "CONFIRM" });
    const view = await loadGateView(db, ana.state.member.id, ROLE_PRESETS.ATTENDANT);
    expect(view?.ownRegistration?.kits.MEMBER).toMatchObject({ kind: "BLOCKED", code: "MEMBER_NOT_CHECKED_IN" });
    expect(view?.ownRegistration?.kits.GUEST).toEqual({
      kind: "BLOCKED",
      code: "HOST_NOT_CHECKED_IN",
      message: "Na fila do kit (inscrição depois que os kits acabaram): só sai se vagar kit.",
    });
    // Na entrada da Ana, o kit dela sai; o do convidado continua na fila.
    expect(await registerCheckIn(security, { personId: ana.state.member.id, method: "SEARCH" })).toMatchObject({
      kit: { kind: "DELIVERED", kitType: "MEMBER" },
      guestKit: null,
    });
    const guestEntry = await registerCheckIn(security, { personId: ana.state.guest!.personId, method: "SEARCH" });
    expect(guestEntry).toMatchObject({ kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.KIT_WAITLIST } });
  });

  it("quem está na fila entra sem kit; sobrou kit, a equipe entrega a sobra (e fica na auditoria)", async () => {
    await configureEvent(admin, { totalAll: 2, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva" });
    await registerMember({ memberName: "Bia Que Nao Veio" });
    const carla = await registerMember({ memberName: "Carla Terceira Lima" });
    for (const reg of [ana, carla]) await decideAffiliation(attendant, { registrationId: reg.registrationId, decision: "CONFIRM" });

    const preview = await loadGateView(db, carla.state.member.id, ROLE_PRESETS.SECURITY);
    expect(preview?.kitOnEntry).toEqual({ kind: "NONE", message: ENTRY_KIT_MESSAGE.KIT_WAITLIST });
    const entry = await registerCheckIn(security, { personId: carla.state.member.id, method: "SEARCH" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.KIT_WAITLIST } });
    const view = await loadGateView(db, carla.state.member.id, ROLE_PRESETS.ATTENDANT);
    expect(view?.ownRegistration?.kits.MEMBER).toMatchObject({ kind: "BLOCKED", code: "KIT_WAITLIST" });

    // Segurança não entrega kit; o Atendimento entrega a sobra (o kit que era da Bia, que não veio).
    expect((await refused(deliverKit(security, { personId: carla.state.member.id, kitType: "MEMBER", leftover: true }))).code).toBe("FORBIDDEN");
    const delivered = await deliverKit(attendant, { personId: carla.state.member.id, kitType: "MEMBER", leftover: true });
    expect(delivered).toMatchObject({ kitType: "MEMBER", stock: { available: 1 } });
    expect((await waitlist(carla.registrationId)).MEMBER).toBeNull();
    const [leftover] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, carla.registrationId), eq(auditLog.action, "KIT_LEFTOVER_RELEASED")));
    expect(leftover?.summary).toBe("Kit de sobra liberado para Carla Terceira Lima, que estava na fila do kit.");
  });
});
