/**
 * Montagem e custo dos kits: quem pode montar, o que fica gravado e quantos
 * kits de cada tipo entram na conta (previsto, fila do kit e entregues).
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { KitPlan } from "@/domain/kit-plan";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { createEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { getKitCounts, getKitPlan, updateKitPlan } from "@/server/services/kit-plan";
import { configureEvent, createStaff, registerMember, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

const plan: KitPlan = {
  items: [
    { id: "cerveja", name: "Cerveja", priceCents: 500 },
    { id: "refri", name: "Refrigerante", priceCents: 400 },
  ],
  kits: { MEMBER: [{ itemId: "cerveja", quantity: 2 }], GUEST: null, EMPLOYEE: null, EMPLOYEE_GUEST: null, COURTESY: null },
  minor: [{ itemId: "refri", quantity: 2 }],
};

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
});

describe("montagem dos kits", () => {
  it("só quem edita Configurações monta; o que foi montado fica gravado e na auditoria", async () => {
    await configureEvent(admin);
    expect(await getKitPlan(db)).toBeNull();
    const error = await updateKitPlan(attendant, plan).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("FORBIDDEN");

    await updateKitPlan(admin, plan);
    expect(await getKitPlan(db)).toEqual(plan);
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.action, "KIT_PLAN_UPDATED"), eq(auditLog.entityType, "stock")));
    expect(audit?.summary).toBe("Montagem dos kits alterada: 2 itens.");
  });

  it("conta os kits de cada tipo: previstos, na fila (com os menores) e entregues", async () => {
    // 3 kits para inscritos: Ana e o convidado (menor) garantem 2; Bia o terceiro; Carla e o convidado dela vão para a fila.
    await configureEvent(admin, { totalAll: 3, totalEmployee: 10, lowStockThreshold: 0 });
    const ana = await registerMember({ memberName: "Ana Primeira Silva", guest: true });
    await db.execute(`UPDATE person SET is_minor = true WHERE id = '${ana.state.guest!.personId}'`);
    await registerMember({ memberName: "Bia Segunda Souza" });
    await registerMember({ memberName: "Carla Terceira Lima", guest: true });
    await createEmployee(admin, { fullName: "Rosa Financeiro Lima", cpf: "", whatsapp: "", jobTitle: "Financeiro", guest: { fullName: "Caio Convidado Lima", cpf: "", isMinor: false } });
    await createEmployee(admin, { fullName: "Lia Cortesia Mendes", cpf: "", whatsapp: "", jobTitle: "Presidência", category: "COURTESY", isMinor: true, guest: null });
    await createEmployee(admin, { fullName: "Teo Sem Kit", cpf: "", whatsapp: "", jobTitle: "Presidência", category: "COURTESY", withKit: false, guest: null });

    await decideAffiliation(attendant, { registrationId: ana.registrationId, decision: "CONFIRM" });
    await registerCheckIn(security, { personId: ana.state.member.id, method: "SEARCH" });

    const counts = await getKitCounts(db);
    expect(counts.forecast).toEqual({
      kits: { MEMBER: 2, GUEST: 1, EMPLOYEE: 1, EMPLOYEE_GUEST: 1, COURTESY: 1 },
      minors: { MEMBER: 0, GUEST: 1, EMPLOYEE: 0, EMPLOYEE_GUEST: 0, COURTESY: 1 },
    });
    expect(counts.waitlist.kits).toMatchObject({ MEMBER: 1, GUEST: 1 });
    expect(counts.delivered.kits).toEqual({ MEMBER: 1, GUEST: 0, EMPLOYEE: 0, EMPLOYEE_GUEST: 0, COURTESY: 0 });
  });
});
