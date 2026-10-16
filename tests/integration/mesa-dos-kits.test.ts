/**
 * Mesa dos kits e gordura (decisão da organização para a festa):
 * - gordura: estoque separado do oficial para quem se inscreve na hora (depois
 *   que as inscrições fecham); o voucher sai "Inscrição na hora";
 * - mesa dos kits: a segurança só registra a entrada; a mesa confere quem
 *   entrou e entrega o kit (baixa no estoque e no sistema, não sai de novo);
 *   o convidado pega o kit sem esperar quem convidou.
 * Sem gordura e com o kit na portaria, tudo segue como antes.
 */
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { eventConfig, kitDelivery, kitStock } from "@/server/db/schema";
import { stockSettingsSchema } from "@/domain/schemas";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { deliverAtDesk, listDeskQueue, loadDeskView } from "@/server/services/desk";
import { createEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { addGuest } from "@/server/services/group";
import { registerDeclaredMember } from "@/server/services/membership";
import { getStaffKitSupply, loadExtraBalance } from "@/server/services/kit-waitlist";
import { cancelKitDelivery, deliverKit } from "@/server/services/kits";
import { getStockOverview, updateKitDeskSettings, updateStockSettings } from "@/server/services/settings";
import { getDashboardStats, getPeopleKitComparison } from "@/server/services/stats";
import { loadVoucherForStaff } from "@/server/queries/vouchers";
import { type DeskEvent, subscribeDeskEvents } from "@/server/realtime";
import { configureEvent, createStaff, personName, randomCpf, registerMember, reload, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;
let desk: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  desk = await createStaff("KIT_DESK", "Marta Mesa");
});

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeInstanceOf(DomainError);
  return error as DomainError;
}

/** As inscrições do site fecharam: daqui em diante, cadastro feito pela equipe é "na hora". */
async function closeRegistrations() {
  await db.update(eventConfig).set({ registrationClosesAt: new Date(Date.now() - 60_000) }).where(eq(eventConfig.id, 1));
}

async function walkIn(options: { guest?: boolean; name?: string } = {}) {
  const created = await registerMember({ actor: attendant, guest: options.guest, memberName: options.name ?? "Rafael Souza Na Hora" });
  await decideAffiliation(attendant, { registrationId: created.registrationId, decision: "CONFIRM" });
  return { ...created, state: await reload(created.registrationId) };
}

async function extraRow() {
  const [row] = await db.select().from(kitStock).where(eq(kitStock.pool, "EXTRA"));
  return row ?? null;
}

describe("gordura: kits de quem se inscreve na hora", () => {
  it("depois que as inscrições fecham, o kit (e o do convidado) sai da gordura e o voucher sai 'na hora'", async () => {
    await configureEvent(admin, { totalAll: 10 });
    const early = await registerMember({ memberName: "Bia Antecipada" });
    await updateKitDeskSettings(admin, { kitsAtDesk: false, extraTotal: 5 });
    await closeRegistrations();

    const late = await walkIn({ guest: true });
    expect(late.state.kitExtra.MEMBER).not.toBeNull();
    expect(late.state.kitExtra.GUEST).not.toBeNull();
    expect(late.state.kitWaitlist).toEqual({ MEMBER: null, GUEST: null });
    // Quem se inscreveu antes continua no oficial.
    expect((await reload(early.registrationId)).kitExtra).toEqual({ MEMBER: null, GUEST: null });

    expect(await loadExtraBalance(db)).toMatchObject({ total: 5, committed: 2, free: 3 });
    // O oficial não conta os kits da gordura na previsão.
    const stats = await getDashboardStats(db);
    expect(stats.kitDemand.member).toBe(1);
    expect(stats.kitDemand.guest).toBe(0);
    const comparison = await getPeopleKitComparison(db);
    expect(comparison.registrations.find((row) => row.id === "WALK_INS")).toMatchObject({ people: 2, withKit: 2 });
    expect(comparison.registrations.find((row) => row.id === "TEACHERS")).toMatchObject({ people: 1 });

    const voucher = await loadVoucherForStaff(late.state.member.id);
    expect(voucher?.walkIn).toBe(true);
    const earlyVoucher = await loadVoucherForStaff(early.state.member.id);
    expect(earlyVoucher?.walkIn).toBe(false);
  });

  it("na portaria (kit junto com a entrada), o kit de quem se inscreveu na hora sai da gordura", async () => {
    await configureEvent(admin, { totalAll: 10 });
    await updateKitDeskSettings(admin, { kitsAtDesk: false, extraTotal: 3 });
    await closeRegistrations();
    const late = await walkIn();
    const entry = await registerCheckIn(security, { personId: late.state.member.id, method: "SEARCH" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DELIVERED", pool: "EXTRA", available: 2 } });
    expect(await extraRow()).toMatchObject({ total: 3, delivered: 1 });
    const overview = await getStockOverview(db);
    expect(overview?.pools.find((pool) => pool.pool === "ALL")?.delivered).toBe(0);
    expect(overview?.extra).toMatchObject({ total: 3, delivered: 1, available: 2 });

    // Estorno: o kit volta para a gordura.
    const [delivery] = await db.select().from(kitDelivery).where(eq(kitDelivery.recipientPersonId, late.state.member.id));
    expect(delivery?.stockPool).toBe("EXTRA");
    await cancelKitDelivery(admin, { deliveryId: delivery!.id, justification: "Kit devolvido na mesa" });
    expect(await extraRow()).toMatchObject({ delivered: 0 });
  });

  it("acabou a gordura: vale a regra do oficial; sem gordura cadastrada, nada muda", async () => {
    await configureEvent(admin, { totalAll: 10 });
    await closeRegistrations();
    // Sem gordura: como antes (kit garantido no oficial).
    const before = await walkIn({ name: "Carla Sem Gordura" });
    expect(before.state.kitExtra.MEMBER).toBeNull();
    expect(before.state.kitWaitlist.MEMBER).toBeNull();

    await updateKitDeskSettings(admin, { kitsAtDesk: false, extraTotal: 1 });
    // A Carla (na hora, ainda sem o kit) passou para a gordura quando ela ganhou kits.
    expect((await reload(before.registrationId)).kitExtra.MEMBER).not.toBeNull();
    const next = await walkIn({ name: "Davi Depois" });
    expect(next.state.kitExtra.MEMBER).toBeNull();
    expect(next.state.kitWaitlist.MEMBER).toBeNull();
  });

  it("a gordura não fica menor do que o já prometido; mudar o estoque oficial não apaga a gordura", async () => {
    await configureEvent(admin, { totalAll: 10 });
    await updateKitDeskSettings(admin, { kitsAtDesk: false, extraTotal: 4 });
    await closeRegistrations();
    await walkIn({ guest: true });
    const error = await refused(updateKitDeskSettings(admin, { kitsAtDesk: false, extraTotal: 1 }));
    expect(error.code).toBe("VALIDATION");
    expect(error.fieldErrors?.extraTotal).toContain("2 kits prometidos");
    await refused(updateKitDeskSettings(attendant, { kitsAtDesk: true, extraTotal: 10 }));

    await updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "UNIFIED", totalAll: 20, lowStockThreshold: 2 }));
    expect(await extraRow()).toMatchObject({ total: 4 });
  });

  it("o cadastro da equipe, depois do fechamento, mostra o saldo da gordura", async () => {
    await configureEvent(admin, { totalAll: 1 });
    await registerMember({ memberName: "Eva Antes" });
    await updateKitDeskSettings(admin, { kitsAtDesk: false, extraTotal: 2 });
    expect((await getStaffKitSupply(db))?.extra ?? null).toBeNull();
    await closeRegistrations();
    expect(await getStaffKitSupply(db)).toMatchObject({ member: 2, extra: { free: 2 } });
  });
});

describe("mesa dos kits: a segurança registra a entrada, a mesa entrega", () => {
  it("a entrada não entrega kit; a mesa entrega uma vez, do estoque certo, e não entrega de novo", async () => {
    await configureEvent(admin, { totalAll: 10 });
    await updateKitDeskSettings(admin, { kitsAtDesk: true, extraTotal: 0 });
    const ana = await registerMember({ memberName: "Ana Lima" });
    await decideAffiliation(attendant, { registrationId: ana.registrationId, decision: "CONFIRM" });

    const preview = await loadGateView(db, ana.state.member.id, security.access);
    expect(preview?.kitOnEntry).toEqual({ kind: "AT_DESK", extra: false, minor: false });

    // A mesa não entrega para quem não passou pela entrada.
    expect((await loadDeskView(db, ana.state.member.id, desk.access))?.kit).toEqual({ kind: "NOT_ENTERED" });
    expect((await refused(deliverAtDesk(desk, { personId: ana.state.member.id }))).code).toBe("INVALID_STATE");

    const entry = await registerCheckIn(security, { personId: ana.state.member.id, method: "QR" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DESK" }, guestKit: null });
    expect(await db.select().from(kitDelivery)).toHaveLength(0);

    const queue = await listDeskQueue(db);
    expect(queue.items.map((item) => item.fullName)).toEqual(["Ana Lima"]);
    expect(queue.pending).toBe(1);
    expect((await loadDeskView(db, ana.state.member.id, desk.access))?.kit).toMatchObject({ kind: "READY", extra: false });

    const done = await deliverAtDesk(desk, { personId: ana.state.member.id });
    expect(done).toMatchObject({ kitType: "MEMBER", pool: "ALL", extra: false, available: 9 });
    expect((await listDeskQueue(db)).pending).toBe(0);
    const second = await refused(deliverAtDesk(desk, { personId: ana.state.member.id }));
    expect(second.code).toBe("ALREADY_DELIVERED");
    expect((await loadDeskView(db, ana.state.member.id, desk.access))?.kit).toMatchObject({ kind: "DELIVERED", byName: "Marta Mesa" });
    // A mesa não registra entradas.
    const other = await registerMember({ memberName: "Bruno Sem Entrada" });
    await decideAffiliation(attendant, { registrationId: other.registrationId, decision: "CONFIRM" });
    expect((await refused(registerCheckIn(desk, { personId: other.state.member.id, method: "SEARCH" }))).code).toBe("FORBIDDEN");
  });

  it("convidado pega o kit depois da própria entrada, sem esperar quem convidou", async () => {
    await configureEvent(admin, { totalAll: 10 });
    await updateKitDeskSettings(admin, { kitsAtDesk: true, extraTotal: 0 });
    const carla = await registerMember({ memberName: "Carla Mendes", guest: true, guestName: personName(2, "Julia") });
    await decideAffiliation(attendant, { registrationId: carla.registrationId, decision: "CONFIRM" });
    const guestId = carla.state.guest!.personId;

    const entry = await registerCheckIn(security, { personId: guestId, method: "SEARCH" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DESK" } });
    const done = await deliverAtDesk(desk, { personId: guestId });
    expect(done).toMatchObject({ kitType: "GUEST" });
    // Quem convidou chega depois: só o kit dela sai (o do convidado já saiu).
    await registerCheckIn(security, { personId: carla.state.member.id, method: "SEARCH" });
    expect(await deliverAtDesk(desk, { personId: carla.state.member.id })).toMatchObject({ kitType: "MEMBER" });
    expect(await db.select().from(kitDelivery).where(and(eq(kitDelivery.registrationId, carla.registrationId)))).toHaveLength(2);
  });

  it("na hora + mesa: a portaria manda à mesa e a mesa entrega da gordura", async () => {
    await configureEvent(admin, { totalAll: 10 });
    await updateKitDeskSettings(admin, { kitsAtDesk: true, extraTotal: 5 });
    await closeRegistrations();
    const late = await walkIn();
    expect((await loadGateView(db, late.state.member.id, security.access))?.walkIn).toBe(true);
    const entry = await registerCheckIn(security, { personId: late.state.member.id, method: "SEARCH" });
    expect(entry).toMatchObject({ kit: { kind: "DESK", extra: true } });
    const view = await loadDeskView(db, late.state.member.id, desk.access);
    expect(view).toMatchObject({ walkIn: true, kit: { kind: "READY", extra: true, pool: "EXTRA" } });
    expect(await deliverAtDesk(desk, { personId: late.state.member.id })).toMatchObject({ pool: "EXTRA", extra: true, available: 4 });
    expect(await extraRow()).toMatchObject({ delivered: 1 });
  });

  it("com o kit na portaria (padrão), nada muda: o kit sai na entrada e o convidado espera quem convidou", async () => {
    await configureEvent(admin, { totalAll: 10 });
    const paulo = await registerMember({ memberName: "Paulo Reis", guest: true, guestCpf: randomCpf() });
    await decideAffiliation(attendant, { registrationId: paulo.registrationId, decision: "CONFIRM" });
    const guestEntry = await registerCheckIn(security, { personId: paulo.state.guest!.personId, method: "SEARCH" });
    expect(guestEntry).toMatchObject({ kit: { kind: "WAITING" } });
    // Pela mesa também não sai antes de quem convidou chegar (regra da portaria).
    expect((await refused(deliverAtDesk(desk, { personId: paulo.state.guest!.personId }))).code).toBe("KIT_NOT_AVAILABLE");
    const hostEntry = await registerCheckIn(security, { personId: paulo.state.member.id, method: "SEARCH" });
    expect(hostEntry).toMatchObject({ kit: { kind: "DELIVERED" }, guestKit: { kind: "DELIVERED" } });
    // Entrega manual continua com a regra antiga.
    await refused(deliverKit(desk, { personId: paulo.state.member.id, kitType: "MEMBER" }));
  });

  it("a mesa fica sabendo na hora: a entrada e o kit avisam pelo banco (tempo real)", async () => {
    await configureEvent(admin, { totalAll: 10 });
    await updateKitDeskSettings(admin, { kitsAtDesk: true, extraTotal: 0 });
    const ana = await registerMember({ memberName: "Ana Ao Vivo" });
    await decideAffiliation(attendant, { registrationId: ana.registrationId, decision: "CONFIRM" });
    const personId = ana.state.member.id;
    const events: DeskEvent[] = [];
    const stop = subscribeDeskEvents((event) => events.push(event));
    try {
      // A escuta liga em segundo plano: um aviso de teste confirma que já está ouvindo.
      await expect
        .poll(
          async () => {
            await db.execute(sql`SELECT pg_notify('desk_queue', '{"t":"kit","p":"teste"}')`);
            return events.some((event) => event.personId === "teste");
          },
          { timeout: 10_000, interval: 200 },
        )
        .toBe(true);
      await registerCheckIn(security, { personId, method: "SEARCH" });
      await expect.poll(() => events.some((event) => event.kind === "entry" && event.personId === personId), { timeout: 5_000 }).toBe(true);
      await deliverAtDesk(desk, { personId });
      await expect.poll(() => events.some((event) => event.kind === "kit" && event.personId === personId), { timeout: 5_000 }).toBe(true);
    } finally {
      stop();
    }
  });

  it("cada grupo com a sua cor na mesa: professor(a), convidado(a), funcionário(a), convidado(a) da casa e cortesia", async () => {
    await configureEvent(admin, { totalAll: 10, totalEmployee: 10 });
    await updateKitDeskSettings(admin, { kitsAtDesk: true, extraTotal: 0 });
    const teacher = await registerMember({ memberName: "Tina Professora Lima", guest: true, guestName: personName(5, "Gui") });
    await decideAffiliation(attendant, { registrationId: teacher.registrationId, decision: "CONFIRM" });
    const staff = await createEmployee(admin, {
      fullName: "Rosa Colaboradora Dias",
      cpf: "",
      whatsapp: "",
      jobTitle: "Financeiro",
      category: "STAFF",
      guest: { fullName: personName(6, "Caio"), cpf: "", isMinor: false },
    });
    const courtesy = await createEmployee(admin, { fullName: "Cora Cortesia Lima", cpf: "", whatsapp: "", jobTitle: "Presidência", category: "COURTESY", guest: null });
    const expected = {
      [teacher.state.member.id]: "TEACHER",
      [teacher.state.guest!.personId]: "TEACHER_GUEST",
      [staff.personId]: "STAFF",
      [staff.guest!.personId]: "EMPLOYEE_GUEST",
      [courtesy.personId]: "COURTESY",
    };
    for (const personId of Object.keys(expected)) await registerCheckIn(security, { personId, method: "SEARCH" });

    const queue = await listDeskQueue(db);
    expect(Object.fromEntries(queue.items.map((item) => [item.personId, item.category]))).toEqual(expected);
    expect(queue.items.find((item) => item.personId === staff.guest!.personId)?.hostName).toBe("Rosa Colaboradora Dias");
    for (const [personId, category] of Object.entries(expected)) {
      expect((await loadDeskView(db, personId, desk.access))?.category).toBe(category);
    }
  });

  it("convidado que virou filiado depois de entrar pega o kit de filiado na mesa (vale o cadastro de agora)", async () => {
    await configureEvent(admin, { totalAll: 10 });
    await updateKitDeskSettings(admin, { kitsAtDesk: true, extraTotal: 0 });
    const host = await registerMember({ memberName: "Lia Professora", guest: true, guestName: personName(4, "Otavio") });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    const guestId = host.state.guest!.personId;
    await registerCheckIn(security, { personId: guestId, method: "SEARCH" });
    const declared = await registerDeclaredMember(attendant, {
      personId: guestId,
      whatsapp: "(86) 99999-1111",
      registrationNumber: "VIROU-2026",
      workplace: "Escola Municipal Sul",
      isTeacher: true,
    });
    await decideAffiliation(attendant, { registrationId: declared.registrationId, decision: "CONFIRM" });
    expect((await loadDeskView(db, guestId, desk.access))?.kit).toMatchObject({ kind: "READY", kitType: "MEMBER" });
    expect(await deliverAtDesk(desk, { personId: guestId })).toMatchObject({ kitType: "MEMBER" });
  });

  it("convidado cadastrado na hora para quem se inscreveu antes ganha o kit da gordura", async () => {
    await configureEvent(admin, { totalAll: 10 });
    const host = await registerMember({ memberName: "Gil Professor" });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    await updateKitDeskSettings(admin, { kitsAtDesk: true, extraTotal: 2 });
    await closeRegistrations();
    await addGuest(attendant, { registrationId: host.registrationId, fullName: personName(3, "Helena"), cpf: randomCpf(), isMinor: false });
    const state = await reload(host.registrationId);
    expect(state.kitExtra).toMatchObject({ MEMBER: null });
    expect(state.kitExtra.GUEST).not.toBeNull();
  });
});
