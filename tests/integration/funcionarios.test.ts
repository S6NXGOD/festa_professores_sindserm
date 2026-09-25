/**
 * Funcionários do SINDSERM liberados para a festa: cadastro só interno, voucher
 * próprio, 1 kit do estoque dos funcionários e 1 convidado, com kit do mesmo
 * estoque depois que o(a) funcionário(a) chegar (mesma regra das professoras e professores).
 */
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { guestLink, kitStock, voucher } from "@/server/db/schema";
import { type EmployeeInput, parseEmployeeLines, SAME_NAME_EMPLOYEE_GUEST_MESSAGE, stockSettingsSchema } from "@/domain/schemas";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { cancelCheckIn, registerCheckIn } from "@/server/services/checkin";
import {
  createEmployee,
  createEmployeesFromList,
  listEmployees,
  removeEmployee,
  restoreEmployee,
  updateEmployee,
} from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { addGuest, removeGuest } from "@/server/services/group";
import { cancelKitDelivery, deliverKit } from "@/server/services/kits";
import { saveAffiliationForm } from "@/server/services/membership";
import { searchPeople } from "@/server/services/people";
import { createRegistration } from "@/server/services/registration";
import { getStockOverview, updateStockSettings } from "@/server/services/settings";
import { getDashboardStats } from "@/server/services/stats";
import { loadEmployeeGroupVouchers, loadVoucherForStaff } from "@/server/queries/vouchers";
import {
  configureEvent,
  createStaff,
  randomCpf,
  registerMember,
  registrationInput,
  resetDatabase,
  staffFicha,
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

function employee(overrides: Partial<EmployeeInput> = {}): EmployeeInput {
  return { fullName: "Rosa Financeiro Lima", cpf: "", whatsapp: "", jobTitle: "Financeiro", guest: null, ...overrides };
}

const GUEST = { fullName: "Caio Convidado Lima", cpf: "", isMinor: false };

async function stockOf(pool: "ALL" | "EMPLOYEE") {
  const [row] = await db.select().from(kitStock).where(eq(kitStock.pool, pool));
  return row ?? null;
}

function setStock(totalEmployee: number, lowStockThreshold = 0) {
  return updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll: 100, totalEmployee, lowStockThreshold }));
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin, { stockMode: "SINGLE", totalAll: 100, totalEmployee: 4, lowStockThreshold: 0 });
});

describe("cadastro interno dos funcionários", () => {
  it("só o administrador libera; o funcionário ganha voucher próprio, e o convidado também", async () => {
    await expectDomainError(createEmployee(attendant, employee()), "FORBIDDEN");
    const created = await createEmployee(admin, employee({ whatsapp: "(86) 99536-1455", guest: GUEST }));
    expect(created.guest?.name).toBe(GUEST.fullName);

    const card = await loadVoucherForStaff(created.personId);
    expect(card).toMatchObject({ kind: "EMPLOYEE", fullName: "Rosa Financeiro Lima", jobTitle: "Financeiro", guestName: GUEST.fullName });
    const guestCard = await loadVoucherForStaff(created.guest!.personId);
    expect(guestCard).toMatchObject({ kind: "GUEST", hostName: "Rosa Financeiro Lima", hostIsEmployee: true });
    const group = await loadEmployeeGroupVouchers(created.personId);
    expect(group?.guest?.fullName).toBe(GUEST.fullName);
    expect(group?.whatsapp).toBe("86995361455");

    const view = await loadGateView(db, created.personId, "SECURITY");
    expect(view).toMatchObject({ role: "EMPLOYEE", entry: { kind: "ALLOWED", role: "EMPLOYEE" } });
    expect(view?.kitOnEntry).toEqual({ kind: "WILL_DELIVER", count: 1, label: "1 kit de funcionário(a)" });
    const [found] = await searchPeople(db, "Caio Convidado", { fullCpf: false });
    expect(found).toMatchObject({ hostName: "Rosa Financeiro Lima", hostIsEmployee: true });
  });

  it("um voucher por pessoa: funcionário não é também filiado(a), convidado(a) nem faz ficha", async () => {
    const member = await registerMember({ guest: true });
    await expectDomainError(createEmployee(admin, employee({ cpf: member.input.member.cpf })), "CONFLICT");
    await expectDomainError(createEmployee(admin, employee({ cpf: member.input.guest!.cpf! })), "CONFLICT");

    const cpf = randomCpf();
    const staffMember = await createEmployee(admin, employee({ cpf }));
    // O link público não aceita o CPF de um funcionário (cadastro é só interno).
    await expectDomainError(createRegistration(PUBLIC_ACTOR, registrationInput({ memberCpf: cpf })), "CPF_TAKEN");
    const host = await registerMember();
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    await expectDomainError(
      addGuest(attendant, { registrationId: host.registrationId, fullName: "Rosa Financeiro Lima", cpf, isMinor: false }),
      "CONFLICT",
    );
    await expectDomainError(
      saveAffiliationForm(attendant, staffFicha({ personId: staffMember.personId, cpf, fullName: "Rosa Financeiro Lima" })),
      "CONFLICT",
    );
    // E o convidado do funcionário não pode ser a própria pessoa (sem CPF e com o mesmo nome).
    await expect(
      createEmployee(admin, employee({ fullName: "Beto Mesmo Nome", guest: { fullName: "Beto Mesmo Nome", cpf: "", isMinor: false } })),
    ).rejects.toThrow(SAME_NAME_EMPLOYEE_GUEST_MESSAGE);
    const withCpf = await createEmployee(admin, employee({ fullName: "Beto Mesmo Nome", cpf: randomCpf() }));
    await expectDomainError(
      addGuest(attendant, { employeeId: withCpf.employeeId, fullName: "Beto Mesmo Nome", cpf: "", isMinor: false }),
      "VALIDATION",
    );
  });

  it("lista colada: \"Nome; Setor; Convidado\", sem duplicar quem já está na lista", async () => {
    await createEmployee(admin, employee({ fullName: "Joao Juridico Souza", jobTitle: "Jurídico" }));
    const result = await createEmployeesFromList(admin, {
      text: "1. Maria Souza; Financeiro; Pedro Souza\nJoao Juridico Souza; Jurídico\n\n• Ana Lima;; Bia Lima\nCarla Dias\n",
    });
    expect(result).toEqual({ created: 3, guests: 2, skipped: ["Joao Juridico Souza"] });
    const rows = await listEmployees(db);
    expect(rows.map((row) => [row.fullName, row.jobTitle, row.guest?.fullName ?? null])).toEqual([
      ["Ana Lima", null, "Bia Lima"],
      ["Carla Dias", null, null],
      ["Joao Juridico Souza", "Jurídico", null],
      ["Maria Souza", "Financeiro", "Pedro Souza"],
    ]);
    await expectDomainError(createEmployeesFromList(admin, { text: "Maria\nJoão Silva" }), "VALIDATION");
  });

  it("parseEmployeeLines: numeração, colunas vazias e a linha com problema", () => {
    const parsed = parseEmployeeLines(
      "Ana Lima - Jurídico\nFulano\n\tBeto Alves\tFinanceiro\tCaio Alves\n1. Carla Dias;; Dora Dias\n2\tDavi Reis\nEva Melo; TI; Eva Melo\nIvo Ruas; A; Bia Ruas; extra",
    );
    expect(parsed.rows).toEqual([
      { line: 1, fullName: "Ana Lima", jobTitle: "Jurídico", guestName: null },
      { line: 3, fullName: "Beto Alves", jobTitle: "Financeiro", guestName: "Caio Alves" },
      { line: 4, fullName: "Carla Dias", jobTitle: null, guestName: "Dora Dias" },
      { line: 5, fullName: "Davi Reis", jobTitle: null, guestName: null },
    ]);
    expect(parsed.errors).toEqual([
      { line: 2, message: "Fulano: Informe nome e sobrenome" },
      { line: 6, message: "Eva Melo: o convidado não pode ter o mesmo nome" },
      { line: 7, message: "Ivo Ruas: use no máximo 3 colunas (nome; setor; convidado)" },
    ]);
  });

  it("o Atendimento cadastra, troca e remove o convidado do funcionário (um por vez)", async () => {
    const created = await createEmployee(admin, employee());
    const added = await addGuest(attendant, { employeeId: created.employeeId, ...GUEST });
    await expectDomainError(addGuest(attendant, { employeeId: created.employeeId, fullName: "Outra Pessoa Silva", cpf: "", isMinor: false }), "CONFLICT");
    const swapped = await addGuest(attendant, {
      employeeId: created.employeeId,
      fullName: "Dani Troca Lima",
      cpf: "",
      isMinor: true,
      replaceGuestLinkId: added.guestLinkId,
    });
    expect(swapped.replaced).toBe(true);
    // O convidado trocado perde o voucher.
    const [oldVoucher] = await db
      .select({ id: voucher.id })
      .from(voucher)
      .where(and(eq(voucher.personId, added.personId), isNull(voucher.revokedAt)));
    expect(oldVoucher).toBeUndefined();
    await removeGuest(attendant, { guestLinkId: swapped.guestLinkId });
    expect((await listEmployees(db))[0]?.guest).toBeNull();
    await expectDomainError(addGuest(attendant, { fullName: "Sem Anfitriao Silva", cpf: "", isMinor: false }), "VALIDATION");
  });
});

describe("entrada e kits do grupo do funcionário", () => {
  it("o kit do funcionário sai na entrada, do estoque dos funcionários", async () => {
    const created = await createEmployee(admin, employee());
    const entry = await registerCheckIn(security, { personId: created.personId, method: "QR" });
    expect(entry).toMatchObject({
      outcome: "CHECKED_IN",
      checkIn: { role: "EMPLOYEE" },
      kit: { kind: "DELIVERED", kitType: "EMPLOYEE", available: 3 },
      guestKit: null,
    });
    expect(await stockOf("EMPLOYEE")).toMatchObject({ total: 4, delivered: 1 });
    // O estoque de professoras, professores e convidados não é tocado.
    expect(await stockOf("ALL")).toMatchObject({ total: 100, delivered: 0 });
    await expectDomainError(deliverKit(attendant, { personId: created.personId, kitType: "EMPLOYEE" }), "ALREADY_DELIVERED");
  });

  it("convidado que chega antes entra e o kit espera; na chegada do funcionário saem 2 kits", async () => {
    const created = await createEmployee(admin, employee({ guest: GUEST }));
    const guestId = created.guest!.personId;

    const guestView = await loadGateView(db, guestId, "SECURITY");
    expect(guestView).toMatchObject({ role: "GUEST", entry: { kind: "ALLOWED", role: "GUEST" }, host: { kind: "EMPLOYEE", fullName: "Rosa Financeiro Lima" } });
    expect(guestView?.kitOnEntry).toEqual({ kind: "WAITING", message: "O kit deste convidado sai quando Rosa Financeiro Lima chegar." });
    const guestEntry = await registerCheckIn(security, { personId: guestId, method: "QR" });
    expect(guestEntry).toMatchObject({ outcome: "CHECKED_IN", checkIn: { role: "GUEST" }, kit: { kind: "WAITING", message: "Sai quando Rosa Financeiro Lima chegar." } });
    expect(await stockOf("EMPLOYEE")).toMatchObject({ delivered: 0 });

    const hostView = await loadGateView(db, created.personId, "SECURITY");
    expect(hostView?.kitOnEntry).toMatchObject({ kind: "WILL_DELIVER", count: 2 });
    const hostEntry = await registerCheckIn(security, { personId: created.personId, method: "QR" });
    expect(hostEntry).toMatchObject({
      kit: { kind: "DELIVERED", kitType: "EMPLOYEE" },
      guestKit: { kind: "DELIVERED", kitType: "GUEST", beneficiaryName: GUEST.fullName },
    });
    expect(await stockOf("EMPLOYEE")).toMatchObject({ delivered: 2 });
    expect(await stockOf("ALL")).toMatchObject({ delivered: 0 });

    // Estornar a entrada do funcionário devolve os 2 kits ao estoque dos funcionários.
    const cancelled = await cancelCheckIn(admin, { personId: created.personId, justification: "Entrada registrada por engano" });
    expect(cancelled.kitsReturned).toBe(2);
    expect(await stockOf("EMPLOYEE")).toMatchObject({ delivered: 0 });
  });

  it("funcionário que chega antes: o kit do convidado sai na entrada do convidado", async () => {
    const created = await createEmployee(admin, employee({ guest: GUEST }));
    await registerCheckIn(security, { personId: created.personId, method: "SEARCH" });
    const guestEntry = await registerCheckIn(security, { personId: created.guest!.personId, method: "SEARCH" });
    expect(guestEntry).toMatchObject({ kit: { kind: "DELIVERED", kitType: "GUEST", beneficiaryName: GUEST.fullName } });
    expect(await stockOf("EMPLOYEE")).toMatchObject({ delivered: 2 });

    // Estorno da entrega do kit do convidado (administrador) volta para o estoque dos funcionários.
    const view = await loadGateView(db, created.personId, "ADMIN");
    const guestKit = view?.employee?.kits.GUEST;
    expect(guestKit?.kind).toBe("DELIVERED");
    await cancelKitDelivery(admin, { deliveryId: guestKit!.kind === "DELIVERED" ? guestKit!.deliveryId : "", justification: "Kit entregue duas vezes" });
    expect(await stockOf("EMPLOYEE")).toMatchObject({ delivered: 1 });
    // Pela tela do funcionário, o kit do convidado sai de novo (reserva).
    const manual = await deliverKit(attendant, { personId: created.personId, kitType: "GUEST" });
    expect(manual).toMatchObject({ kitType: "GUEST", beneficiaryName: GUEST.fullName, stock: { pool: "EMPLOYEE", delivered: 2 } });
    await expectDomainError(deliverKit(attendant, { personId: created.guest!.personId, kitType: "GUEST" }), "GUEST_CANNOT_RECEIVE_KIT");
  });

  it("sem estoque cadastrado ou esgotado: entra sem kit e a tela diz o porquê; reposto, sai pelo botão", async () => {
    await setStock(0);
    const noStock = await createEmployee(admin, employee({ fullName: "Sem Estoque Silva" }));
    expect((await loadGateView(db, noStock.personId, "SECURITY"))?.kitOnEntry).toEqual({
      kind: "NONE",
      message: "Sem kit: cadastre o estoque de kits dos funcionários (Kits e estoque).",
    });
    expect(await registerCheckIn(security, { personId: noStock.personId, method: "QR" })).toMatchObject({
      outcome: "CHECKED_IN",
      kit: { kind: "NONE", message: "Sem kit: cadastre o estoque de kits dos funcionários (Kits e estoque)." },
    });
    await expectDomainError(deliverKit(attendant, { personId: noStock.personId, kitType: "EMPLOYEE" }), "OUT_OF_STOCK");

    await setStock(1);
    const manual = await deliverKit(attendant, { personId: noStock.personId, kitType: "EMPLOYEE" });
    expect(manual.stock).toMatchObject({ pool: "EMPLOYEE", total: 1, delivered: 1, available: 0 });
    const late = await createEmployee(admin, employee({ fullName: "Chegou Tarde Silva" }));
    expect(await registerCheckIn(security, { personId: late.personId, method: "QR" })).toMatchObject({
      kit: { kind: "NONE", message: "Sem kit: o estoque acabou." },
    });
  });

  it("alerta do estoque dos funcionários: só quando o que resta não dá para quem ainda vai receber", async () => {
    // O limite geral (15) é pensado para os kits da festa; nos funcionários não vale.
    await setStock(3, 15);
    const employeePool = async () => (await getStockOverview(db))!.pools.find((pool) => pool.pool === "EMPLOYEE");
    const first = await createEmployee(admin, employee({ fullName: "Equipe Um Silva", guest: GUEST }));
    expect(await employeePool()).toMatchObject({ available: 3, awaiting: 2, low: false });

    await createEmployee(admin, employee({ fullName: "Equipe Dois Silva" }));
    await createEmployee(admin, employee({ fullName: "Equipe Tres Silva" }));
    expect(await employeePool()).toMatchObject({ available: 3, awaiting: 4, low: true });

    const entry = await registerCheckIn(security, { personId: first.personId, method: "QR" });
    expect(entry).toMatchObject({ kit: { kind: "DELIVERED", available: 2, low: true } });
    expect(await employeePool()).toMatchObject({ available: 2, awaiting: 3, low: true });
    expect((await getStockOverview(db))!.pools.find((pool) => pool.pool === "ALL")).toMatchObject({ low: false });
  });

  it("o total do estoque dos funcionários não fica abaixo do que já foi entregue (funcionários + convidados)", async () => {
    const created = await createEmployee(admin, employee({ guest: GUEST }));
    await registerCheckIn(security, { personId: created.guest!.personId, method: "QR" });
    await registerCheckIn(security, { personId: created.personId, method: "QR" });
    const error = await expectDomainError(setStock(1), "VALIDATION");
    expect(error.fieldErrors?.totalEmployee).toMatch(/Já foram entregues 2/);
  });

  it("o placar conta funcionários, convidados deles e os kits do estoque dos funcionários", async () => {
    const a = await createEmployee(admin, employee({ fullName: "Equipe Um Silva", guest: GUEST }));
    await createEmployee(admin, employee({ fullName: "Equipe Dois Silva" }));
    await registerCheckIn(security, { personId: a.personId, method: "SEARCH" });
    const stats = await getDashboardStats(db);
    expect(stats).toMatchObject({
      employees: 2,
      employeesPresent: 1,
      employeeGuests: 1,
      kitsDeliveredEmployee: 1,
      kitsDeliveredGuest: 0,
      // Faltam: o kit do Equipe Dois e o do convidado do Equipe Um.
      kitsOwedEmployee: 2,
      kitDemand: { employee: 3 },
      present: 1,
      expected: 3,
    });
  });
});

describe("tirar da lista e trazer de volta", () => {
  it("tirar da lista cancela o voucher e o convite do convidado; volta com voucher novo", async () => {
    const created = await createEmployee(admin, employee({ guest: GUEST }));
    const guestId = created.guest!.personId;
    const [first] = await db
      .select({ code: voucher.code })
      .from(voucher)
      .where(and(eq(voucher.personId, created.personId), isNull(voucher.revokedAt)));

    const removed = await removeEmployee(admin, { employeeId: created.employeeId });
    expect(removed).toMatchObject({ removed: true, guestRemoved: true });
    const blocked = await loadGateView(db, created.personId, "SECURITY");
    expect(blocked?.entry).toMatchObject({ kind: "BLOCKED", code: "EMPLOYEE_REMOVED" });
    await expectDomainError(registerCheckIn(security, { personId: created.personId, method: "SEARCH" }), "ENTRY_BLOCKED");
    // O convidado não fica "sobrando": o convite acaba e o QR dele é cancelado.
    await expectDomainError(registerCheckIn(security, { personId: guestId, method: "SEARCH" }), "ENTRY_BLOCKED");
    const [guestVoucher] = await db.select({ id: voucher.id }).from(voucher).where(and(eq(voucher.personId, guestId), isNull(voucher.revokedAt)));
    expect(guestVoucher).toBeUndefined();
    const [link] = await db.select({ status: guestLink.status, endReason: guestLink.endReason }).from(guestLink).where(eq(guestLink.guestPersonId, guestId));
    expect(link).toEqual({ status: "REMOVED", endReason: "Funcionário(a) saiu da lista" });

    await restoreEmployee(admin, { employeeId: created.employeeId });
    const [second] = await db
      .select({ code: voucher.code })
      .from(voucher)
      .where(and(eq(voucher.personId, created.personId), isNull(voucher.revokedAt)));
    expect(second?.code).toBeTruthy();
    expect(second?.code).not.toBe(first?.code);
    expect(await registerCheckIn(security, { personId: created.personId, method: "SEARCH" })).toMatchObject({ outcome: "CHECKED_IN" });
  });

  it("quem já entrou (ou o convidado que já entrou) não sai da lista sem estornar a entrada", async () => {
    const withGuest = await createEmployee(admin, employee({ guest: GUEST }));
    await registerCheckIn(security, { personId: withGuest.guest!.personId, method: "SEARCH" });
    const guestIn = await expectDomainError(removeEmployee(admin, { employeeId: withGuest.employeeId }), "INVALID_STATE");
    expect(guestIn.message).toMatch(/convidado .* já entrou/);

    const alone = await createEmployee(admin, employee({ fullName: "Sozinho Entrou Silva" }));
    await registerCheckIn(security, { personId: alone.personId, method: "SEARCH" });
    await expectDomainError(removeEmployee(admin, { employeeId: alone.employeeId }), "INVALID_STATE");
    // Editar os dados continua possível.
    await updateEmployee(admin, { employeeId: alone.employeeId, fullName: "Sozinho Entrou Souza", cpf: "", whatsapp: "", jobTitle: "TI" });
    expect((await listEmployees(db)).find((row) => row.employeeId === alone.employeeId)).toMatchObject({ fullName: "Sozinho Entrou Souza", jobTitle: "TI" });
  });
});
