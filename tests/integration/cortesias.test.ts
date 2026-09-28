/**
 * Cortesias da organização (amigos, familiares e convidados da diretoria, dos
 * funcionários e dos prestadores): cadastro só interno, voucher próprio e
 * 1 kit do estoque dos colaboradores, que sai na entrada da própria pessoa.
 * Cortesia não leva convidado: cada pessoa é uma cortesia.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ROLE_PRESETS } from "@/domain/access";
import { db } from "@/server/db";
import { kitStock } from "@/server/db/schema";
import { COURTESY_NO_GUEST_MESSAGE, type EmployeeInput, parseEmployeeLines } from "@/domain/schemas";
import { employeeDetail, employeeTitleLine } from "@/domain/labels";
import { listEntries } from "@/server/queries/entries";
import { loadVoucherForStaff } from "@/server/queries/vouchers";
import type { StaffActor } from "@/server/services/actor";
import { registerCheckIn } from "@/server/services/checkin";
import { createEmployee, createEmployeesFromList, listEmployees, updateEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { addGuest } from "@/server/services/group";
import { searchPeople } from "@/server/services/people";
import { getDashboardStats } from "@/server/services/stats";
import { configureEvent, createStaff, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

function courtesy(overrides: Partial<EmployeeInput> = {}): EmployeeInput {
  return { fullName: "Carla Mendes Silva", cpf: "", whatsapp: "", jobTitle: "Presidência", category: "COURTESY", guest: null, ...overrides };
}

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeTruthy();
  return error as Error;
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin, { stockMode: "SINGLE", totalAll: 100, totalEmployee: 5, lowStockThreshold: 0 });
});

describe("cortesias da organização", () => {
  it("cortesia tem voucher próprio (rosa, com quem convidou) e fica fora da lista de colaboradores", async () => {
    const created = await createEmployee(admin, courtesy({ isMinor: true }));
    await createEmployee(admin, { fullName: "Rosa Financeiro Lima", cpf: "", whatsapp: "", jobTitle: "Financeiro", guest: null });

    expect((await listEmployees(db, { kind: "courtesies" })).map((row) => row.fullName)).toEqual(["Carla Mendes Silva"]);
    expect((await listEmployees(db, { kind: "collaborators" })).map((row) => row.fullName)).toEqual(["Rosa Financeiro Lima"]);

    const card = await loadVoucherForStaff(created.personId);
    expect(card).toMatchObject({ kind: "EMPLOYEE", category: "COURTESY", jobTitle: "Presidência" });
    expect(employeeTitleLine("COURTESY", "Presidência")).toBe("Cortesia do SINDSERM · Convite: Presidência");
    expect(employeeDetail("STAFF", "Financeiro")).toBe("Financeiro");

    // Portaria: acha pela busca, vê a categoria, quem convidou e o aviso de menor de idade.
    const view = await loadGateView(db, created.personId, ROLE_PRESETS.SECURITY);
    expect(view).toMatchObject({ role: "EMPLOYEE", isMinor: true, employee: { category: "COURTESY", jobTitle: "Presidência" } });
    const found = await searchPeople(db, "Carla Mendes", { fullCpf: false });
    expect(found[0]).toMatchObject({ fullName: "Carla Mendes Silva", employee: { category: "COURTESY" } });
  });

  it("o kit sai na entrada da própria cortesia, do estoque dos colaboradores", async () => {
    const created = await createEmployee(admin, courtesy());
    const entry = await registerCheckIn(security, { personId: created.personId, method: "QR" });
    expect(entry).toMatchObject({
      outcome: "CHECKED_IN",
      checkIn: { role: "EMPLOYEE" },
      kit: { kind: "DELIVERED", kitType: "EMPLOYEE", available: 4 },
      guestKit: null,
    });
    const [pool] = await db.select().from(kitStock).where(eq(kitStock.pool, "EMPLOYEE"));
    expect(pool).toMatchObject({ total: 5, delivered: 1 });
  });

  it("cortesia não leva convidado: nem no cadastro, nem pela portaria, nem virando cortesia depois", async () => {
    const withGuest = await refused(createEmployee(admin, courtesy({ guest: { fullName: "Pedro Mendes Silva", cpf: "", isMinor: false } })));
    expect(JSON.stringify(withGuest)).toContain(COURTESY_NO_GUEST_MESSAGE);

    const created = await createEmployee(admin, courtesy());
    const atGate = await refused(addGuest(attendant, { employeeId: created.employeeId, fullName: "Pedro Mendes Silva", cpf: "", isMinor: false }));
    expect(atGate).toBeInstanceOf(DomainError);
    expect(atGate.message).toBe(COURTESY_NO_GUEST_MESSAGE);

    // Colaborador(a) com convidado não vira cortesia sem tirar o convidado antes.
    const staff = await createEmployee(admin, {
      fullName: "Rosa Financeiro Lima",
      cpf: "",
      whatsapp: "",
      jobTitle: "Financeiro",
      guest: { fullName: "Caio Convidado Lima", cpf: "", isMinor: false },
    });
    const switched = await refused(
      updateEmployee(admin, { employeeId: staff.employeeId, fullName: "Rosa Financeiro Lima", cpf: "", whatsapp: "", jobTitle: "", category: "COURTESY" }),
    );
    expect(switched.message).toContain("Tire o convidado de Rosa Financeiro Lima antes");
  });

  it("lista colada de cortesias: \"Nome; Quem convidou\", com quem convidou para a lista toda", async () => {
    const parsed = parseEmployeeLines("1. Carla Mendes Silva; Presidência\n2. João Pedro Mendes\nLucas Mendes Silva; Família; Outro Nome", { courtesy: true });
    expect(parsed.rows.map((row) => [row.fullName, row.jobTitle])).toEqual([
      ["Carla Mendes Silva", "Presidência"],
      ["João Pedro Mendes", null],
    ]);
    expect(parsed.errors[0]?.message).toContain("use no máximo 2 colunas (nome; quem convidou)");

    const result = await createEmployeesFromList(admin, {
      text: "Carla Mendes Silva; Presidência\nJoão Pedro Mendes\nLucas Mendes Silva",
      category: "COURTESY",
      invitedBy: "Família do Carlos",
    });
    expect(result).toMatchObject({ created: 3, guests: 0 });
    const rows = await listEmployees(db, { kind: "courtesies" });
    expect(rows.map((row) => [row.fullName, row.jobTitle, row.category])).toEqual([
      ["Carla Mendes Silva", "Presidência", "COURTESY"],
      ["João Pedro Mendes", "Família do Carlos", "COURTESY"],
      ["Lucas Mendes Silva", "Família do Carlos", "COURTESY"],
    ]);
    // Colar a mesma lista de novo não duplica ninguém.
    expect(await createEmployeesFromList(admin, { text: "João Pedro Mendes", category: "COURTESY", invitedBy: "" })).toMatchObject({
      created: 0,
      skipped: ["João Pedro Mendes"],
    });
  });

  it("placar e estoque: cortesias contam à parte, mas o kit delas entra na previsão do estoque dos colaboradores", async () => {
    const one = await createEmployee(admin, courtesy());
    await createEmployee(admin, courtesy({ fullName: "João Pedro Mendes" }));
    await createEmployee(admin, {
      fullName: "Rosa Financeiro Lima",
      cpf: "",
      whatsapp: "",
      jobTitle: "Financeiro",
      guest: { fullName: "Caio Convidado Lima", cpf: "", isMinor: false },
    });
    await registerCheckIn(security, { personId: one.personId, method: "SEARCH" });
    const stats = await getDashboardStats(db);
    expect(stats).toMatchObject({
      employees: 3,
      courtesies: 2,
      courtesiesPresent: 1,
      employeesPresent: 1,
      // Rosa + convidado dela + 2 cortesias.
      kitDemand: { employee: 4 },
      kitsOwedEmployee: 3,
    });
  });

  it("Entradas separa cortesias de colaboradores", async () => {
    const guest = await createEmployee(admin, courtesy());
    const staff = await createEmployee(admin, { fullName: "Rosa Financeiro Lima", cpf: "", whatsapp: "", jobTitle: "Financeiro", guest: null });
    await registerCheckIn(security, { personId: guest.personId, method: "QR" });
    await registerCheckIn(security, { personId: staff.personId, method: "QR" });
    expect((await listEntries({ filter: "cortesias", page: 1 })).rows.map((row) => row.fullName)).toEqual(["Carla Mendes Silva"]);
    expect((await listEntries({ filter: "colaboradores", page: 1 })).rows.map((row) => row.fullName)).toEqual(["Rosa Financeiro Lima"]);
    expect((await listEntries({ filter: "cortesias", page: 1 })).total).toBe(1);
  });
});
