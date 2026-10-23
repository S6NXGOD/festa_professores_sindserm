/**
 * Apagar ou tirar da lista vários colaboradores e cortesias de uma vez (ex.: o
 * que veio do pacote de outra festa e não vale nesta). Quem nunca entrou nem
 * recebeu kit some de vez, com o voucher, o convidado e os convidados sem kit;
 * quem tem histórico só sai da lista; quem está dentro da festa não sai.
 */
import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, employee, guestLink, person, voucher } from "@/server/db/schema";
import type { StaffActor } from "@/server/services/actor";
import { cancelCheckIn, registerCheckIn } from "@/server/services/checkin";
import { addCompanion, bulkEmployees, createEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { getDashboardStats } from "@/server/services/stats";
import { configureEvent, createStaff, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin, { totalAll: 100, totalEmployee: 50 });
});

function courtesy(fullName: string) {
  return createEmployee(admin, { fullName, cpf: "", whatsapp: "", jobTitle: "Festa dos professores", category: "COURTESY", guest: null });
}

const exists = async (table: typeof employee | typeof person, id: string) =>
  (await db.select({ id: table.id }).from(table).where(eq(table.id, id))).length > 0;

describe("apagar em massa", () => {
  it("quem nunca entrou some de vez: cadastro, voucher, convidado e convidados sem kit de quem trouxe", async () => {
    const rosa = await createEmployee(admin, {
      fullName: "Rosa Financeiro Lima",
      cpf: "",
      whatsapp: "",
      jobTitle: "Financeiro",
      category: "STAFF",
      guest: { fullName: "Caio Convidado Lima", cpf: "", isMinor: false },
    });
    const companion = await addCompanion(admin, { hostEmployeeId: rosa.employeeId, fullName: "Joana Amiga Rosa", cpf: "", isMinor: false });
    const carla = await courtesy("Carla Mendes Silva");
    const fica = await courtesy("Fica Na Lista Souza");
    const guestPersonId = (await db.select({ id: guestLink.guestPersonId }).from(guestLink).where(eq(guestLink.employeeId, rosa.employeeId)))[0]!.id;

    // A convidada sem kit selecionada junto com quem trouxe não dá erro (sai com ela).
    const outcome = await bulkEmployees(admin, { employeeIds: [rosa.employeeId, companion.employeeId, carla.employeeId], mode: "delete" });
    expect(outcome.deleted.sort()).toEqual(["Carla Mendes Silva", "Joana Amiga Rosa", "Rosa Financeiro Lima"]);
    expect(outcome).toMatchObject({ removed: [], skipped: [] });

    for (const id of [rosa.employeeId, companion.employeeId, carla.employeeId]) expect(await exists(employee, id)).toBe(false);
    for (const id of [rosa.personId, companion.personId, carla.personId, guestPersonId]) expect(await exists(person, id)).toBe(false);
    expect(await db.select().from(voucher).where(inArray(voucher.personId, [rosa.personId, carla.personId, guestPersonId]))).toHaveLength(0);
    expect(await db.select().from(guestLink).where(eq(guestLink.employeeId, rosa.employeeId))).toHaveLength(0);
    // Quem não foi selecionado fica.
    expect(await exists(employee, fica.employeeId)).toBe(true);

    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "EMPLOYEES_DELETED"));
    expect(audit?.summary).toContain("3 pessoas apagadas de vez");
  });

  it("quem tem entrada no histórico só sai da lista; quem está dentro da festa não sai", async () => {
    const estornada = await courtesy("Estornada Entrada Lopes");
    const dentro = await courtesy("Dentro Da Festa Rocha");
    await registerCheckIn(security, { personId: estornada.personId, method: "SEARCH" });
    await cancelCheckIn(admin, { personId: estornada.personId, justification: "Entrada registrada por engano" });
    await registerCheckIn(security, { personId: dentro.personId, method: "SEARCH" });

    const outcome = await bulkEmployees(admin, { employeeIds: [estornada.employeeId, dentro.employeeId], mode: "delete" });
    expect(outcome.deleted).toEqual([]);
    expect(outcome.removed).toEqual(["Estornada Entrada Lopes"]);
    expect(outcome.skipped).toEqual([{ name: "Dentro Da Festa Rocha", reason: "já entrou (estorne a entrada antes)" }]);

    const [kept] = await db.select().from(employee).where(eq(employee.id, estornada.employeeId));
    expect(kept?.removedAt).toBeInstanceOf(Date);
    expect(await exists(person, estornada.personId)).toBe(true);
    const [active] = await db.select().from(employee).where(eq(employee.id, dentro.employeeId));
    expect(active?.removedAt).toBeNull();

    // Apagar de novo quem só saiu da lista: o histórico não deixa sumir.
    const again = await bulkEmployees(admin, { employeeIds: [estornada.employeeId], mode: "delete" });
    expect(again.skipped).toEqual([{ name: "Estornada Entrada Lopes", reason: "tem entrada ou kit no histórico: continua em Tirados da lista" }]);
  });

  it("só tirar da lista dá para desfazer; depois, quem nunca entrou ainda pode ser apagado de vez", async () => {
    const one = await courtesy("Primeira Cortesia Alves");
    const two = await courtesy("Segunda Cortesia Alves");
    const removed = await bulkEmployees(admin, { employeeIds: [one.employeeId, two.employeeId], mode: "remove" });
    expect(removed.removed.sort()).toEqual(["Primeira Cortesia Alves", "Segunda Cortesia Alves"]);
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "EMPLOYEES_BULK_REMOVED"));
    expect(audit?.summary).toContain("2 pessoas tiradas da lista");

    const deleted = await bulkEmployees(admin, { employeeIds: [one.employeeId], mode: "delete" });
    expect(deleted.deleted).toEqual(["Primeira Cortesia Alves"]);
    expect(await exists(employee, one.employeeId)).toBe(false);
  });

  it("só quem cuida dos colaboradores apaga; precisa escolher alguém", async () => {
    const carla = await courtesy("Carla Mendes Silva");
    const forbidden = await bulkEmployees(attendant, { employeeIds: [carla.employeeId], mode: "delete" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(forbidden).toBeInstanceOf(DomainError);
    expect((forbidden as DomainError).code).toBe("FORBIDDEN");
    await expect(bulkEmployees(admin, { employeeIds: [], mode: "delete" })).rejects.toThrow();
  });
});

describe("placar: prontos para entrar é todo mundo que tem voucher", () => {
  it("colaboradores e cortesias contam (já liberados), na parte da organização; apagados, saem da conta", async () => {
    const carla = await courtesy("Carla Mendes Silva");
    const rosa = await createEmployee(admin, { fullName: "Rosa Financeiro Lima", cpf: "", whatsapp: "", jobTitle: "Financeiro", category: "STAFF", guest: null });
    let stats = await getDashboardStats(db);
    expect(stats).toMatchObject({ expected: 2, ready: 2, registrationsExpected: 0, registrationsReady: 0, organizationExpected: 2, organizationPresent: 0 });

    await bulkEmployees(admin, { employeeIds: [carla.employeeId, rosa.employeeId], mode: "delete" });
    stats = await getDashboardStats(db);
    expect(stats).toMatchObject({ expected: 0, ready: 0, organizationExpected: 0 });
  });
});
