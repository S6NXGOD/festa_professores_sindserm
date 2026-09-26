/**
 * Controle de entrada: quem entrou, a que horas, quem registrou e como, os kits
 * que saíram junto, estornos e a planilha.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { cancelCheckIn, registerCheckIn } from "@/server/services/checkin";
import { createEmployee } from "@/server/services/employees";
import { csvCell, entriesCsv, entrySummary, entryOperators, listEntries } from "@/server/queries/entries";
import { configureEvent, createStaff, registerMember, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin, { totalAll: 100, totalEmployee: 10 });
});

/** Professora com convidado; o convidado chega antes (kit espera) e ela chega depois (saem 2 kits). */
async function festa() {
  const group = await registerMember({ guest: true, memberName: "Maria Professora Souza", guestName: "Luiza Convidada Lima" });
  await decideAffiliation(attendant, { registrationId: group.registrationId, decision: "CONFIRM" });
  const employee = await createEmployee(admin, {
    fullName: "Rosa Colaboradora Dias",
    cpf: "",
    whatsapp: "",
    jobTitle: "Financeiro",
    category: "STAFF",
    guest: null,
  });
  await registerCheckIn(attendant, { personId: group.state.guest!.personId, method: "SEARCH" });
  await registerCheckIn(security, { personId: group.state.member.id, method: "QR" });
  await registerCheckIn(security, { personId: employee.personId, method: "CODE" });
  return { group, employee };
}

describe("controle de entrada", () => {
  it("lista da mais recente para a mais antiga, com quem registrou, como e os kits de cada entrada", async () => {
    await festa();
    const all = await listEntries({ filter: "todas", page: 1 });
    expect(all.total).toBe(3);
    expect(all.rows.map((row) => row.fullName)).toEqual(["Rosa Colaboradora Dias", "Maria Professora Souza", "Luiza Convidada Lima"]);
    const [rosa, maria, luiza] = all.rows;
    expect(rosa).toMatchObject({ role: "EMPLOYEE", method: "CODE", byName: "Sergio Seguranca", employeeCategory: "STAFF", kitsAtEntry: 1 });
    // A professora chegou depois do convidado: os 2 kits saíram na entrada dela.
    expect(maria).toMatchObject({ role: "MEMBER", isTeacher: true, method: "QR", byName: "Sergio Seguranca", kitsAtEntry: 2 });
    expect(luiza).toMatchObject({ role: "GUEST", hostName: "Maria Professora Souza", method: "SEARCH", byName: "Paulo Atendente", kitsAtEntry: 0 });
  });

  it("filtra por tipo, por quem registrou e pelo nome", async () => {
    await festa();
    expect((await listEntries({ filter: "filiados", page: 1 })).rows.map((r) => r.fullName)).toEqual(["Maria Professora Souza"]);
    expect((await listEntries({ filter: "convidados", page: 1 })).rows.map((r) => r.fullName)).toEqual(["Luiza Convidada Lima"]);
    expect((await listEntries({ filter: "colaboradores", page: 1 })).rows.map((r) => r.fullName)).toEqual(["Rosa Colaboradora Dias"]);
    const bySecurity = await listEntries({ filter: "todas", operator: security.userId, page: 1 });
    expect(bySecurity.rows.map((r) => r.fullName)).toEqual(["Rosa Colaboradora Dias", "Maria Professora Souza"]);
    expect((await listEntries({ filter: "todas", q: "luiza", page: 1 })).rows).toHaveLength(1);
    expect(await entryOperators()).toEqual([
      { userId: attendant.userId, name: "Paulo Atendente" },
      { userId: security.userId, name: "Sergio Seguranca" },
    ]);
  });

  it("estorno sai da lista e vai para 'Estornadas', com quem estornou e o motivo", async () => {
    const { employee } = await festa();
    await cancelCheckIn(admin, { personId: employee.personId, justification: "Entrada registrada por engano" });
    expect((await listEntries({ filter: "todas", page: 1 })).total).toBe(2);
    const cancelled = await listEntries({ filter: "estornadas", page: 1 });
    expect(cancelled.rows).toHaveLength(1);
    expect(cancelled.rows[0]).toMatchObject({
      fullName: "Rosa Colaboradora Dias",
      cancelledByName: "Ana Administradora",
      cancelReason: "Entrada registrada por engano",
      kitsAtEntry: 0,
    });
  });

  it("resumo: total, estornos, entradas antes do horário, como entraram e quem registrou mais", async () => {
    const { employee } = await festa();
    await cancelCheckIn(admin, { personId: employee.personId, justification: "Entrada registrada por engano" });
    const summary = await entrySummary(null);
    expect(summary).toMatchObject({ total: 2, cancelled: 1, early: 0, byMethod: { QR: 1, SEARCH: 1, CODE: 0 } });
    expect(summary.operators).toEqual([
      { userId: attendant.userId, name: "Paulo Atendente", total: 1 },
      { userId: security.userId, name: "Sergio Seguranca", total: 1 },
    ]);
    // Com a festa marcada para depois das entradas, as duas valendo contam como "antes do horário".
    expect((await entrySummary(new Date(Date.now() + 3_600_000))).early).toBe(2);
  });

  it("planilha: todas as entradas (inclusive estornadas), pronta para o Excel e sem fórmulas escondidas", async () => {
    const { employee } = await festa();
    await cancelCheckIn(admin, { personId: employee.personId, justification: "Registrada; por engano" });
    const csv = entriesCsv((await listEntries({ filter: "todas", page: 1 })).rows.concat((await listEntries({ filter: "estornadas", page: 1 })).rows), null);
    expect(csv.startsWith("﻿Horário;Nome;Tipo;Convidado(a) de;Registrada por;Como")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines.find((line) => line.includes("Luiza Convidada Lima"))).toContain(";Convidado(a);Maria Professora Souza;Paulo Atendente;Pesquisa manual;0;");
    expect(lines.find((line) => line.includes("Rosa Colaboradora Dias"))).toContain(';Estornada;Ana Administradora;');
    expect(lines.find((line) => line.includes("Rosa Colaboradora Dias"))).toContain('"Registrada; por engano"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+55 86")).toBe("'+55 86");
    expect(csvCell("Maria")).toBe("Maria");
  });
});
