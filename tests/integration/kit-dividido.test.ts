/**
 * Kit dividido (festa das servidoras e servidores, decisão da organização em
 * 26/10/2026): um kit por inscrição, para o(a) filiado(a) e o convidado. O
 * convidado não tem kit próprio: não guarda kit no estoque, não entra na fila e
 * não pega kit na portaria nem na mesa. Desde 27/10, o mesmo vale para o convidado
 * do(a) colaborador(a): o kit é só de quem se inscreveu, dos colaboradores e das cortesias.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLE_PRESETS } from "@/domain/access";
import { EDITION } from "@/domain/edition";
import { kitOutlook } from "@/domain/kit-supply";
import { sharedKitMessage } from "@/domain/labels";
import { db } from "@/server/db";
import { eventConfig, kitDelivery, registration } from "@/server/db/schema";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { loadDeskView } from "@/server/services/desk";
import { createEmployee } from "@/server/services/employees";
import { loadGateView } from "@/server/services/gate-view";
import { getKitSupply, kitWaitlistPositions, listKitWaitlist } from "@/server/services/kit-waitlist";
import { getDashboardStats, getPeopleKitComparison } from "@/server/services/stats";
import { configureEvent, createStaff, registerMember, reload, resetDatabase } from "../helpers/factories";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FESTA_EDICAO = "servidores";
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_FESTA_EDICAO;
});

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
});

const confirm = (registrationId: string) => decideAffiliation(attendant, { registrationId, decision: "CONFIRM" });

describe("kit dividido: um kit por inscrição, para os dois", () => {
  it("é a regra desta festa", () => {
    expect(EDITION).toMatchObject({ id: "servidores", sharedKit: true });
  });

  it("o estoque guarda 1 kit por inscrição, com ou sem convidado; o convidado nunca entra na fila", async () => {
    await configureEvent(admin, { totalAll: 2, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    const bia = await registerMember({ memberName: "Bia Segunda Souza", guest: true });
    // Antes seriam 4 kits (2 inscrições + 2 convidados); agora são 2, e o estoque de 2 basta.
    expect((await reload(ana.registrationId)).kitWaitlist).toEqual({ MEMBER: null, GUEST: null });
    expect((await reload(bia.registrationId)).kitWaitlist).toEqual({ MEMBER: null, GUEST: null });
    const stats = await getDashboardStats(db);
    expect(stats.kitDemand).toMatchObject({ member: 2, guest: 0 });
    expect(stats.kitWaitlist).toEqual({ member: 0, guest: 0 });

    // Esgotou: quem vem depois tem só o próprio kit na fila (o convidado não tem kit).
    const supply = await getKitSupply(db);
    expect(kitOutlook(supply, { teacher: true, guest: true })).toEqual({ member: "WAITLIST", guest: null, position: { member: 1, guest: null } });
    const carla = await registerMember({ memberName: "Carla Terceira Lima", guest: true });
    expect((await reload(carla.registrationId)).kitWaitlist.MEMBER).toBeInstanceOf(Date);
    expect(await kitWaitlistPositions(db, carla.registrationId)).toEqual({ MEMBER: 1, GUEST: null });
    expect((await listKitWaitlist(db)).map((slot) => slot.kitType)).toEqual(["MEMBER"]);
  });

  it("na portaria: o convidado entra sem kit próprio; o kit sai na entrada do(a) titular, para os dois", async () => {
    await configureEvent(admin, { totalAll: 10, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true, guestName: "Gabi Convidada Silva" });
    await confirm(ana.registrationId);
    const guestId = ana.state.guest!.personId;

    expect((await loadGateView(db, guestId, ROLE_PRESETS.SECURITY))?.kitOnEntry).toEqual({ kind: "NONE", message: sharedKitMessage("Ana Primeira Silva") });
    expect(await registerCheckIn(security, { personId: guestId, method: "SEARCH" })).toMatchObject({
      outcome: "CHECKED_IN",
      kit: { kind: "NONE", message: sharedKitMessage("Ana Primeira Silva") },
      guestKit: null,
    });

    expect((await loadGateView(db, ana.state.member.id, ROLE_PRESETS.SECURITY))?.kitOnEntry).toMatchObject({
      kind: "WILL_DELIVER",
      count: 1,
      label: "1 kit de consumação, para dividir com Gabi",
    });
    expect(await registerCheckIn(security, { personId: ana.state.member.id, method: "SEARCH" })).toMatchObject({
      outcome: "CHECKED_IN",
      kit: { kind: "DELIVERED", kitType: "MEMBER" },
      guestKit: null,
    });

    // Um kit só saiu do estoque, e nada fica "a entregar".
    expect(await db.select({ kitType: kitDelivery.kitType }).from(kitDelivery)).toEqual([{ kitType: "MEMBER" }]);
    expect(await getDashboardStats(db)).toMatchObject({ kitsDeliveredMember: 1, kitsDeliveredGuest: 0, kitsOwedMember: 0, kitsOwedGuest: 0 });
    expect((await loadGateView(db, ana.state.member.id, ROLE_PRESETS.ADMIN))?.ownRegistration?.kits.GUEST).toMatchObject({
      kind: "BLOCKED",
      code: "SHARED_KIT",
      message: "Kit dividido: o de Ana Primeira Silva é para os dois.",
    });
  });

  it("na mesa dos kits: o convidado não pega kit; o de quem convidou é para os dois", async () => {
    await configureEvent(admin, { totalAll: 10, lowStockThreshold: 0 });
    await db.update(eventConfig).set({ kitsAtDesk: true }).where(eq(eventConfig.id, 1));
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    await confirm(ana.registrationId);
    await registerCheckIn(security, { personId: ana.state.guest!.personId, method: "SEARCH" });
    const desk = await loadDeskView(db, ana.state.guest!.personId, ROLE_PRESETS.ADMIN);
    expect(desk?.kit).toMatchObject({ kind: "BLOCKED", code: "SHARED_KIT" });
    expect(desk?.kit.kind === "BLOCKED" ? desk.kit.message : "").toContain("o kit de Ana Primeira Silva é para os dois");
  });

  it("pessoas e kits: o convidado conta como pessoa, sem kit próprio", async () => {
    await configureEvent(admin, { totalAll: 10, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    await confirm(ana.registrationId);
    const { registrations } = await getPeopleKitComparison(db);
    expect(registrations.find((group) => group.id === "TEACHERS")).toMatchObject({ people: 1, withKit: 1 });
    expect(registrations.find((group) => group.id === "TEACHER_GUESTS")).toMatchObject({ people: 1, withKit: 0, pending: 0, waitlist: 0 });
    // O placar conta as duas pessoas.
    expect(await getDashboardStats(db)).toMatchObject({ expected: 2, ready: 2, guests: 1 });
  });

  it("marcas antigas de kit de convidado no banco (de antes da mudança) não pesam em nada", async () => {
    await configureEvent(admin, { totalAll: 1, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    await db.update(registration).set({ guestKitWaitlistedAt: new Date(), guestKitExtraAt: new Date() }).where(eq(registration.id, ana.registrationId));
    expect((await reload(ana.registrationId)).kitWaitlist).toEqual({ MEMBER: null, GUEST: null });
    expect(await listKitWaitlist(db)).toEqual([]);
    expect((await getDashboardStats(db)).kitWaitlist).toEqual({ member: 0, guest: 0 });
    expect((await getPeopleKitComparison(db)).registrations.find((group) => group.id === "TEACHER_GUESTS")).toMatchObject({ people: 1, withKit: 0 });
  });

  it("colaboradores também: o convidado do(a) colaborador(a) não tem kit próprio; o kit é para os dois", async () => {
    await configureEvent(admin, { totalAll: 10, totalEmployee: 10, lowStockThreshold: 0 });
    const rosa = await createEmployee(admin, {
      fullName: "Rosa Colaboradora Lima",
      cpf: "",
      whatsapp: "",
      jobTitle: "Financeiro",
      category: "STAFF",
      guest: { fullName: "Caio Convidado Lima", cpf: "", isMinor: false },
    });
    const view = await loadGateView(db, rosa.personId, ROLE_PRESETS.ADMIN);
    const guestPersonId = view?.employee?.guest?.personId;
    expect(guestPersonId).toBeTruthy();
    // O que se conta: 1 kit para a colaboradora (para os dois); o convidado não entra na conta nem na mesa.
    expect((await getDashboardStats(db)).kitDemand.employee).toBe(1);
    expect((await getPeopleKitComparison(db)).house.find((group) => group.id === "EMPLOYEE_GUESTS")).toMatchObject({ people: 1, withKit: 0 });
    expect((await loadGateView(db, guestPersonId!, ROLE_PRESETS.SECURITY))?.kitOnEntry).toEqual({
      kind: "NONE",
      message: sharedKitMessage("Rosa Colaboradora Lima"),
    });
    expect(await registerCheckIn(security, { personId: guestPersonId!, method: "SEARCH" })).toMatchObject({
      kit: { kind: "NONE", message: sharedKitMessage("Rosa Colaboradora Lima") },
    });
    // A colaboradora chega: sai 1 kit, para os dois.
    expect((await loadGateView(db, rosa.personId, ROLE_PRESETS.SECURITY))?.kitOnEntry).toMatchObject({
      kind: "WILL_DELIVER",
      count: 1,
      label: "1 kit de colaborador(a), para dividir com Caio",
    });
    expect(await registerCheckIn(security, { personId: rosa.personId, method: "SEARCH" })).toMatchObject({
      outcome: "CHECKED_IN",
      kit: { kind: "DELIVERED", kitType: "EMPLOYEE" },
      guestKit: null,
    });
    expect(await db.select({ kitType: kitDelivery.kitType }).from(kitDelivery)).toEqual([{ kitType: "EMPLOYEE" }]);
    expect((await getDashboardStats(db)).kitsOwedEmployee).toBe(0);
  });
});
