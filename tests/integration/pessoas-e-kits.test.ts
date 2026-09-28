/**
 * Quadro "Pessoas e kits" (Kits e estoque): cada grupo lado a lado — pessoas,
 * com direito a kit, a confirmar, entregues e quem já entrou — com as mesmas
 * contas do placar e da previsão do estoque.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { kitDemandOf, peopleKitsSummary, sumRows, toDeliver } from "@/domain/kit-comparison";
import { db } from "@/server/db";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { addCompanion, createEmployee } from "@/server/services/employees";
import { getDashboardStats, getPeopleKitComparison } from "@/server/services/stats";
import { configureEvent, createStaff, registerMember, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin, { stockMode: "SINGLE", totalAll: 100, totalEmployee: 3, lowStockThreshold: 0 });
});

/** Uma festa pequena com um pouco de tudo. */
async function smallParty() {
  // Inscrições: professora confirmada com convidado, professor aguardando conferência com convidado,
  // filiada que não é professora (confirmada) e uma inscrição não confirmada.
  const ana = await registerMember({ memberName: "Ana Professora Lima", guest: true, guestName: "Beto Convidado Lima" });
  await decideAffiliation(attendant, { registrationId: ana.registrationId, decision: "CONFIRM" });
  await registerMember({ memberName: "Caio Professor Dias", guest: true, guestName: "Duda Convidada Dias" });
  const eva = await registerMember({ memberName: "Eva Filiada Rocha", isTeacher: false });
  await decideAffiliation(attendant, { registrationId: eva.registrationId, decision: "CONFIRM" });
  const fabio = await registerMember({ memberName: "Fabio Recusado Melo" });
  await decideAffiliation(attendant, { registrationId: fabio.registrationId, decision: "REJECT" });

  // SINDSERM: funcionária com convidado, diretor sem convidado, cortesia com kit, cortesia sem kit
  // e um convidado sem kit trazido pela funcionária.
  const rosa = await createEmployee(admin, {
    fullName: "Rosa Financeiro Lima",
    cpf: "",
    whatsapp: "",
    jobTitle: "Financeiro",
    category: "STAFF",
    guest: { fullName: "Caio Convidado Rosa", cpf: "", isMinor: false },
  });
  await createEmployee(admin, { fullName: "Bruno Diretor Costa", cpf: "", whatsapp: "", jobTitle: "Presidência", category: "BOARD", guest: null });
  await createEmployee(admin, { fullName: "Carla Cortesia Silva", cpf: "", whatsapp: "", jobTitle: "Presidência", category: "COURTESY", guest: null });
  await createEmployee(admin, {
    fullName: "Davi Sem Kit Souza",
    cpf: "",
    whatsapp: "",
    jobTitle: "Presidência",
    category: "COURTESY",
    withKit: false,
    guest: null,
  });
  const lucas = await addCompanion(attendant, { hostEmployeeId: rosa.employeeId, fullName: "Lucas Amigo Rosa", cpf: "", isMinor: false });

  // Entradas: a professora e o convidado dela (2 kits), a funcionária (1 kit) e o convidado sem kit.
  await registerCheckIn(security, { personId: ana.state.member.id, method: "QR" });
  await registerCheckIn(security, { personId: ana.state.guest!.personId, method: "QR" });
  await registerCheckIn(security, { personId: rosa.personId, method: "QR" });
  await registerCheckIn(security, { personId: lucas.personId, method: "QR" });
}

describe("pessoas e kits", () => {
  it("cada grupo com pessoas, direito a kit, a confirmar, entregues, faltam e entradas", async () => {
    await smallParty();
    const comparison = await getPeopleKitComparison(db);

    expect(comparison.registrations).toEqual([
      { id: "TEACHERS", people: 2, withKit: 1, pending: 1, delivered: 1, present: 1 },
      { id: "TEACHER_GUESTS", people: 2, withKit: 1, pending: 1, delivered: 1, present: 1 },
      { id: "OTHER_MEMBERS", people: 1, withKit: 0, pending: 0, delivered: 0, present: 0 },
    ]);
    expect(comparison.house).toEqual([
      { id: "EMPLOYEES", people: 2, withKit: 2, pending: 0, delivered: 1, present: 1 },
      { id: "EMPLOYEE_GUESTS", people: 1, withKit: 1, pending: 0, delivered: 0, present: 0 },
      { id: "COURTESIES", people: 1, withKit: 1, pending: 0, delivered: 0, present: 0 },
      { id: "WITHOUT_KIT", people: 2, withKit: 0, pending: 0, delivered: 0, present: 1 },
    ]);
    expect(comparison.rejected).toBe(1);
    expect(comparison.employeeCategories).toEqual({ BOARD: 1, STAFF: 1, CONTRACTOR: 0 });
    expect(comparison.companions).toBe(1);

    const totals = sumRows([...comparison.registrations, ...comparison.house]);
    expect(totals).toEqual({ people: 11, withKit: 6, pending: 2, delivered: 3, present: 4, toDeliver: 3 });
  });

  it("as contas batem com o placar e com a previsão do estoque", async () => {
    await smallParty();
    const [comparison, stats] = await Promise.all([getPeopleKitComparison(db), getDashboardStats(db)]);
    const all = [...comparison.registrations, ...comparison.house];

    expect(kitDemandOf(comparison)).toEqual(stats.kitDemand);
    expect(sumRows(all).delivered).toBe(stats.kitsDeliveredMember + stats.kitsDeliveredGuest + stats.kitsDeliveredEmployee);
    expect(all.reduce((sum, row) => sum + toDeliver(row), 0)).toBe(stats.kitsOwedMember + stats.kitsOwedGuest + stats.kitsOwedEmployee);
    expect(sumRows(all).present).toBe(stats.present);
    expect(sumRows(all).people).toBe(stats.expected);
  });

  it("resumo pronto para o WhatsApp, com a comparação de cada estoque", async () => {
    await smallParty();
    const comparison = await getPeopleKitComparison(db);
    const text = peopleKitsSummary({
      eventName: "Festa das Professoras e Professores – SINDSERMTHE 2026",
      when: "28/09 às 14:05",
      comparison,
      pools: [
        { pool: "ALL", total: 100 },
        { pool: "EMPLOYEE", total: 3 },
      ],
    });
    expect(text).toContain("Festa das Professoras e Professores – SINDSERMTHE 2026 – pessoas e kits (28/09 às 14:05)");
    expect(text).toContain("• Professoras e professores: 2 · 1 com kit (+1 a confirmar)");
    expect(text).toContain("• Outras pessoas filiadas: 1 (sem kit)");
    expect(text).toContain("• Filiação não confirmada (fora da conta): 1");
    expect(text).toContain("• Colaboradores do SINDSERM: 2 · 2 com kit");
    expect(text).toContain("• Cortesias e convidados sem kit: 2 (sem kit)");
    expect(text).toContain("TOTAL: 11 pessoas · 6 kits garantidos (+2 a confirmar)");
    // Geral: 2 professoras/professores + 2 convidados previstos; colaboradores: Rosa, Bruno, o convidado da Rosa e a cortesia com kit.
    expect(text).toContain("Estoque: geral 100 para 4 previstos (sobram 96) · dos colaboradores 3 para 4 previstos (faltam 1)");
    expect(text).toContain("Entregues até agora: 3 · faltam sair: 3 · já entraram: 4");
  });

  it("festa vazia: tudo zerado, sem quebrar", async () => {
    const comparison = await getPeopleKitComparison(db);
    expect(sumRows([...comparison.registrations, ...comparison.house])).toEqual({
      people: 0,
      withKit: 0,
      pending: 0,
      delivered: 0,
      present: 0,
      toDeliver: 0,
    });
    expect(peopleKitsSummary({ eventName: "Festa", when: "agora", comparison, pools: [] })).toContain("Estoque: não cadastrado");
  });
});
