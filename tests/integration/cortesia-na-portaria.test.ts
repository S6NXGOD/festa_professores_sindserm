/**
 * Cortesia na portaria: o(a) responsável pela porta cadastra na hora quem a
 * organização mandou entrar. A permissão é por pessoa ("Cortesia na portaria");
 * Administrador sempre tem, e quem edita Colaboradores e cortesias também.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { type AccessMap, can, resolveAccess, ROLE_PRESETS, sanitizeAccess } from "@/domain/access";
import type { GateCourtesyInput } from "@/domain/schemas";
import { db } from "@/server/db";
import { auditLog, employee, kitStock } from "@/server/db/schema";
import { type StaffActor, staffActor } from "@/server/services/actor";
import { registerCheckIn } from "@/server/services/checkin";
import { createCourtesyAtGate, createEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { configureEvent, createStaff, randomCpf, registerMember, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let security: StaffActor;
/** Segurança/Recepção com a opção "Cortesia na portaria" ligada (o(a) responsável pela porta). */
let responsible: StaffActor;

const WITH_OPTION: AccessMap = { ...ROLE_PRESETS.SECURITY, gateCourtesy: true };

function courtesy(overrides: Partial<GateCourtesyInput> = {}): GateCourtesyInput {
  return { fullName: "Helena Convite Rapido", cpf: "", whatsapp: "", jobTitle: "Presidência", isMinor: false, withKit: true, ...overrides };
}

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeInstanceOf(DomainError);
  return error as DomainError;
}

async function employeeStock() {
  const [pool] = await db.select().from(kitStock).where(eq(kitStock.pool, "EMPLOYEE"));
  return pool!;
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  const lead = await createStaff("SECURITY", "Rita Responsavel Portaria");
  responsible = staffActor({ userId: lead.userId, name: lead.name, role: "SECURITY", access: WITH_OPTION });
  await configureEvent(admin, { stockMode: "SINGLE", totalAll: 100, totalEmployee: 5, lowStockThreshold: 0 });
});

describe("permissão Cortesia na portaria", () => {
  it("Administrador sempre; Atendimento e Segurança só com a opção ligada; quem edita Colaboradores e cortesias também", () => {
    expect(can(ROLE_PRESETS.ADMIN, "createCourtesyAtGate")).toBe(true);
    expect(can(ROLE_PRESETS.ATTENDANT, "createCourtesyAtGate")).toBe(false);
    expect(can(ROLE_PRESETS.SECURITY, "createCourtesyAtGate")).toBe(false);
    expect(can(WITH_OPTION, "createCourtesyAtGate")).toBe(true);
    const employeesEditor: AccessMap = { ...ROLE_PRESETS.ATTENDANT, modules: { ...ROLE_PRESETS.ATTENDANT.modules, colaboradores: "edit" } };
    expect(can(employeesEditor, "createCourtesyAtGate")).toBe(true);
    // Sem Portaria, a opção não tem onde valer.
    const noGate: AccessMap = { ...WITH_OPTION, modules: { ...WITH_OPTION.modules, portaria: "none" } };
    expect(can(noGate, "createCourtesyAtGate")).toBe(false);
    // A opção não abre o cadastro de cortesias do painel (nem a lista de colaboradores).
    expect(can(WITH_OPTION, "manageEmployees")).toBe(false);
    expect(can(WITH_OPTION, "viewEmployees")).toBe(false);
  });

  it("gravada: só true liga; ajuste antigo (de antes da opção) fica com o padrão do perfil", () => {
    expect(sanitizeAccess({ modules: ROLE_PRESETS.SECURITY.modules, fullCpf: false, gateCourtesy: "sim" }).gateCourtesy).toBe(false);
    const old = JSON.stringify({ modules: { ...ROLE_PRESETS.SECURITY.modules, placar: "view" }, fullCpf: false });
    expect(resolveAccess("SECURITY", old).gateCourtesy).toBe(false);
    expect(resolveAccess("SECURITY", JSON.stringify({ ...WITH_OPTION })).gateCourtesy).toBe(true);
  });

  it("sem a opção, o servidor barra (o botão escondido não basta)", async () => {
    const error = await refused(createCourtesyAtGate(security, courtesy()));
    expect(error.code).toBe("FORBIDDEN");
    // Com a opção, o cadastro de cortesias do painel continua fechado.
    expect((await refused(createEmployee(responsible, { ...courtesy(), category: "COURTESY", guest: null }))).code).toBe("FORBIDDEN");
  });
});

describe("cadastro rápido de cortesia na portaria", () => {
  it("o(a) responsável cadastra na hora; a portaria libera e o kit sai do estoque dos colaboradores", async () => {
    const created = await createCourtesyAtGate(responsible, courtesy());
    const [row] = await db.select().from(employee).where(eq(employee.id, created.employeeId));
    expect(row).toMatchObject({ category: "COURTESY", withKit: true, jobTitle: "Presidência", createdByUserId: responsible.userId });

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, created.employeeId), eq(auditLog.action, "EMPLOYEE_ADDED")));
    expect(audit).toMatchObject({ actorUserId: responsible.userId });
    expect(audit!.summary).toBe("Helena Convite Rapido liberado(a) na portaria como cortesia (Presidência).");

    const view = await loadGateView(db, created.personId, responsible.access);
    expect(view).toMatchObject({ role: "EMPLOYEE", employee: { category: "COURTESY", jobTitle: "Presidência" } });
    const entry = await registerCheckIn(responsible, { personId: created.personId, method: "SEARCH" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DELIVERED", kitType: "EMPLOYEE" } });
    expect(await employeeStock()).toMatchObject({ total: 5, delivered: 1 });
  });

  it("sem kit: entra sem mexer no estoque", async () => {
    const created = await createCourtesyAtGate(responsible, courtesy({ withKit: false }));
    const entry = await registerCheckIn(responsible, { personId: created.personId, method: "SEARCH" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "NONE" } });
    expect(await employeeStock()).toMatchObject({ delivered: 0 });
  });

  it("sem CPF, nome que já está na festa é barrado (é quase sempre a mesma pessoa); com CPF, vale o CPF", async () => {
    const member = await registerMember({ memberName: "Maria Filiada Silva" });
    const sameName = await refused(createCourtesyAtGate(responsible, courtesy({ fullName: "MARIA FILIADA SILVA" })));
    expect(sameName.code).toBe("CONFLICT");
    expect(sameName.fieldErrors).toMatchObject({ fullName: "Este nome já está na festa" });

    await createCourtesyAtGate(responsible, courtesy());
    expect((await refused(createCourtesyAtGate(responsible, courtesy()))).code).toBe("CONFLICT");

    // O CPF da filiada: é ela mesma, já inscrita.
    const sameCpf = await refused(createCourtesyAtGate(responsible, courtesy({ fullName: "Maria Filiada Silva", cpf: member.input.member.cpf })));
    expect(sameCpf.message).toContain("inscrita na festa como filiado(a)");
    // Outra pessoa com o mesmo nome, com o próprio CPF: entra.
    await expect(createCourtesyAtGate(responsible, courtesy({ fullName: "Maria Filiada Silva", cpf: randomCpf() }))).resolves.toMatchObject({
      restored: false,
    });
  });
});
