/**
 * Convidado(a) sem kit de colaborador(a) ("convidado do Rodrigo, sem kit"):
 * cadastrado na hora pela portaria (ou antes, no cadastro da pessoa), vira uma
 * cortesia sem kit ligada a quem trouxe, com voucher próprio. Entra normalmente
 * e o estoque não é mexido. Cortesias também podem ser cadastradas sem kit.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ROLE_PRESETS } from "@/domain/access";
import { ENTRY_KIT_MESSAGE, KIT_BLOCK_MESSAGE } from "@/domain/labels";
import { COURTESY_NO_GUEST_MESSAGE, type EmployeeInput } from "@/domain/schemas";
import { db } from "@/server/db";
import { kitStock } from "@/server/db/schema";
import { loadVoucherForStaff } from "@/server/queries/vouchers";
import type { StaffActor } from "@/server/services/actor";
import { registerCheckIn } from "@/server/services/checkin";
import { addCompanion, createEmployee, createEmployeesFromList, listEmployees, removeEmployee, updateEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { deliverKit } from "@/server/services/kits";
import { searchPeople } from "@/server/services/people";
import { countEmployeesAwaitingKit } from "@/server/services/settings";
import { getDashboardStats } from "@/server/services/stats";
import { configureEvent, createStaff, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

function staff(overrides: Partial<EmployeeInput> = {}): EmployeeInput {
  return { fullName: "Rodrigo Carneiro Lima", cpf: "", whatsapp: "", jobTitle: "Financeiro", category: "STAFF", guest: null, ...overrides };
}

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeTruthy();
  return error as Error;
}

async function employeePool() {
  const [pool] = await db.select().from(kitStock).where(eq(kitStock.pool, "EMPLOYEE"));
  return pool!;
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin, { stockMode: "SINGLE", totalAll: 100, totalEmployee: 5, lowStockThreshold: 0 });
});

describe("convidado sem kit de colaborador(a)", () => {
  it("cadastrado na portaria pelo Atendimento: voucher próprio, entra sem kit e o estoque não mexe", async () => {
    const rodrigo = await createEmployee(admin, staff());
    const created = await addCompanion(attendant, { hostEmployeeId: rodrigo.employeeId, fullName: "Lucas Amigo Souza", cpf: "", isMinor: true });
    expect(created.hostName).toBe("Rodrigo Carneiro Lima");

    // Voucher: passe de cortesia "Convidado(a) de Rodrigo", sem kit.
    expect(await loadVoucherForStaff(created.personId)).toMatchObject({
      kind: "EMPLOYEE",
      category: "COURTESY",
      withoutKit: true,
      broughtByName: "Rodrigo Carneiro Lima",
    });

    // Portaria: quem trouxe, o aviso de menor e "sem kit" antes de confirmar.
    const view = (await loadGateView(db, created.personId, ROLE_PRESETS.SECURITY))!;
    expect(view).toMatchObject({
      role: "EMPLOYEE",
      isMinor: true,
      entry: { kind: "ALLOWED" },
      employee: { category: "COURTESY", withKit: false, broughtBy: { fullName: "Rodrigo Carneiro Lima", category: "STAFF" } },
      kitOnEntry: { kind: "NONE", message: ENTRY_KIT_MESSAGE.WITHOUT_KIT },
    });
    expect(view.employee!.kits.EMPLOYEE).toEqual({ kind: "BLOCKED", message: KIT_BLOCK_MESSAGE.WITHOUT_KIT });
    expect((await searchPeople(db, "Lucas Amigo", { fullCpf: false }))[0]).toMatchObject({
      employee: { category: "COURTESY", withKit: false, jobTitle: "Rodrigo Carneiro Lima" },
    });

    // Entra antes de quem trouxe: não depende da chegada do(a) colaborador(a).
    const entry = await registerCheckIn(security, { personId: created.personId, method: "QR" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", checkIn: { role: "EMPLOYEE" }, kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.WITHOUT_KIT } });
    expect(await employeePool()).toMatchObject({ total: 5, delivered: 0 });

    // Nem pela entrega manual o kit sai.
    const manual = await refused(deliverKit(admin, { personId: created.personId, kitType: "EMPLOYEE" }));
    expect(manual).toBeInstanceOf(DomainError);
    expect(manual.message).toBe(KIT_BLOCK_MESSAGE.WITHOUT_KIT);

    // Rodrigo continua com o kit dele e a vaga do convidado com kit livre.
    const host = (await loadGateView(db, rodrigo.personId, ROLE_PRESETS.ATTENDANT))!;
    expect(host.employee!.companions).toEqual([
      { employeeId: created.employeeId, personId: created.personId, fullName: "Lucas Amigo Souza", isMinor: true, checkedIn: true },
    ]);
    expect(host.employee!.guest).toBeNull();
    const hostEntry = await registerCheckIn(security, { personId: rodrigo.personId, method: "QR" });
    expect(hostEntry).toMatchObject({ kit: { kind: "DELIVERED", kitType: "EMPLOYEE" }, guestKit: null });
    expect(await employeePool()).toMatchObject({ delivered: 1 });
  });

  it("quem pode: Atendimento e administração; segurança não; cortesia e colaborador(a) fora da lista não trazem ninguém", async () => {
    const rodrigo = await createEmployee(admin, staff());
    const input = { hostEmployeeId: rodrigo.employeeId, fullName: "Lucas Amigo Souza", cpf: "", isMinor: false };
    const bySecurity = await refused(addCompanion(security, input));
    expect(bySecurity).toMatchObject({ code: "FORBIDDEN" });
    await addCompanion(admin, input);
    // Vários convidados sem kit por colaborador(a).
    await addCompanion(attendant, { ...input, fullName: "Bia Amiga Souza" });
    expect((await loadGateView(db, rodrigo.personId, ROLE_PRESETS.ADMIN))!.employee!.companions.map((c) => c.fullName)).toEqual([
      "Lucas Amigo Souza",
      "Bia Amiga Souza",
    ]);

    const courtesy = await createEmployee(admin, staff({ fullName: "Carla Mendes Silva", jobTitle: "Presidência", category: "COURTESY" }));
    const fromCourtesy = await refused(addCompanion(attendant, { ...input, hostEmployeeId: courtesy.employeeId, fullName: "Pedro Mendes" }));
    expect(fromCourtesy.message).toBe(COURTESY_NO_GUEST_MESSAGE);

    const removed = await createEmployee(admin, staff({ fullName: "Marta Prestadora Dias", category: "CONTRACTOR" }));
    await removeEmployee(admin, { employeeId: removed.employeeId });
    const fromRemoved = await refused(addCompanion(attendant, { ...input, hostEmployeeId: removed.employeeId, fullName: "Tiago Amigo" }));
    expect(fromRemoved.message).toContain("fora da lista");
  });

  it("Atendimento tira da lista o convidado sem kit cadastrado por engano, mas não colaboradores nem cortesias da organização", async () => {
    const rodrigo = await createEmployee(admin, staff());
    const courtesy = await createEmployee(admin, staff({ fullName: "Carla Mendes Silva", jobTitle: "Presidência", category: "COURTESY" }));
    const companion = await addCompanion(attendant, { hostEmployeeId: rodrigo.employeeId, fullName: "Lucas Amigo Souza", cpf: "", isMinor: false });

    expect(await removeEmployee(attendant, { employeeId: companion.employeeId })).toMatchObject({ removed: true });
    // O voucher dele(a) deixa de valer.
    expect(await loadVoucherForStaff(companion.personId)).toBeNull();
    expect((await loadGateView(db, rodrigo.personId, ROLE_PRESETS.ATTENDANT))!.employee!.companions).toEqual([]);

    expect(await refused(removeEmployee(attendant, { employeeId: rodrigo.employeeId }))).toMatchObject({ code: "FORBIDDEN" });
    expect(await refused(removeEmployee(attendant, { employeeId: courtesy.employeeId }))).toMatchObject({ code: "FORBIDDEN" });
    expect(await refused(removeEmployee(security, { employeeId: companion.employeeId }))).toMatchObject({ code: "FORBIDDEN" });
  });

  it("colaborador(a) sempre tem kit: o \"sem kit\" e o vínculo com quem trouxe são só de cortesia", async () => {
    const rodrigo = await createEmployee(admin, staff({ withKit: false }));
    const rows = await listEmployees(db, { kind: "all" });
    expect(rows.find((row) => row.employeeId === rodrigo.employeeId)).toMatchObject({ withKit: true, hostEmployeeId: null });

    // Convidado sem kit promovido a funcionário(a): ganha kit e deixa de ser "de alguém".
    const companion = await addCompanion(attendant, { hostEmployeeId: rodrigo.employeeId, fullName: "Lucas Amigo Souza", cpf: "", isMinor: false });
    await updateEmployee(admin, {
      employeeId: companion.employeeId,
      fullName: "Lucas Amigo Souza",
      cpf: "",
      whatsapp: "",
      jobTitle: "Recepção",
      category: "STAFF",
      withKit: false,
    });
    const promoted = (await listEmployees(db, { kind: "all" })).find((row) => row.employeeId === companion.employeeId);
    expect(promoted).toMatchObject({ category: "STAFF", withKit: true, hostEmployeeId: null });
  });
});

describe("cortesia sem kit", () => {
  it("pelo cadastro e pela lista colada; fora da previsão do estoque; voltar a ter kit libera o kit na entrada", async () => {
    const lone = await createEmployee(admin, staff({ fullName: "Carla Mendes Silva", jobTitle: "Presidência", category: "COURTESY", withKit: false }));
    const list = await createEmployeesFromList(admin, { text: "João Pedro Mendes\nLucas Mendes Silva", category: "COURTESY", invitedBy: "Família do Carlos", withKit: false });
    expect(list).toMatchObject({ created: 2 });
    await createEmployee(admin, staff({ fullName: "Bia Cortesia Lima", jobTitle: "Presidência", category: "COURTESY" }));
    await createEmployee(admin, staff());

    const courtesies = await listEmployees(db, { kind: "courtesies" });
    expect(courtesies.map((row) => [row.fullName, row.withKit])).toEqual([
      ["Bia Cortesia Lima", true],
      ["Carla Mendes Silva", false],
      ["João Pedro Mendes", false],
      ["Lucas Mendes Silva", false],
    ]);

    // Previsão do estoque dos colaboradores: Rodrigo + a cortesia com kit (as 3 sem kit ficam fora).
    expect(await getDashboardStats(db)).toMatchObject({ courtesies: 4, kitDemand: { employee: 2 }, kitsOwedEmployee: 2 });
    expect(await countEmployeesAwaitingKit(db)).toBe(2);

    expect(await registerCheckIn(security, { personId: lone.personId, method: "SEARCH" })).toMatchObject({
      kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.WITHOUT_KIT },
    });

    // Mudou de ideia: com kit de novo (a entrada já registrada libera a entrega manual).
    await updateEmployee(admin, {
      employeeId: lone.employeeId,
      fullName: "Carla Mendes Silva",
      cpf: "",
      whatsapp: "",
      jobTitle: "Presidência",
      category: "COURTESY",
      withKit: true,
    });
    expect(await deliverKit(admin, { personId: lone.personId, kitType: "EMPLOYEE" })).toMatchObject({ stock: { available: 4 } });
    expect(await employeePool()).toMatchObject({ delivered: 1 });
  });
});
