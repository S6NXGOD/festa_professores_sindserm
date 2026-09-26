/**
 * Filas do Atendimento: o que o menu, as páginas e o placar contam como
 * trabalho a fazer — inscrições para conferir (em Inscrições) e fichas para
 * assinar (em Fichas de filiação).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  hasAnyEntry,
  listAffiliationForms,
  listOrder,
  listRegistrations,
  listVerificationQueue,
  queueCounts,
  registrationStatusCounts,
} from "@/server/queries/panel";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { cancelAffiliationForm, formalizeAffiliation, saveAffiliationForm } from "@/server/services/membership";
import { getDashboardStats } from "@/server/services/stats";
import {
  attachTestDocuments,
  configureEvent,
  createStaff,
  randomCpf,
  registerMember,
  registerPreAffiliation,
  resetDatabase,
  staffFicha,
} from "../helpers/factories";

let attendant: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  const admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  await configureEvent(admin);
});

describe("filas do Atendimento", () => {
  it("conferir = inscrições pendentes; assinar = fichas em aberto, do site e do Atendimento", async () => {
    const member = await registerMember({ memberName: "Carla Conferir Souza" });
    await registerPreAffiliation({ fullName: "Daniel Ficha Site" });
    const staff = await saveAffiliationForm(attendant, staffFicha({ cpf: randomCpf(), fullName: "Elisa Ficha Balcao" }));

    // Menu, páginas e placar contam igual.
    expect(await queueCounts()).toEqual({ pending: 1, signature: 2 });
    const stats = await getDashboardStats(db);
    expect(stats.pending).toBe(1);
    expect(stats.draftForms).toBe(2);

    // Por padrão, as mais recentes primeiro; "mais antigas" mostra quem espera há mais tempo.
    expect((await listAffiliationForms({ status: "DRAFT", page: 1 })).rows.map((row) => row.fullName)).toEqual([
      "Elisa Ficha Balcao",
      "Daniel Ficha Site",
    ]);
    const drafts = await listAffiliationForms({ status: "DRAFT", page: 1, order: "antigas" });
    expect(drafts.rows.map((row) => row.fullName)).toEqual(["Daniel Ficha Site", "Elisa Ficha Balcao"]);
    expect(drafts.rows[0]).toMatchObject({ origin: "PUBLIC", hasRg: true, hasPayslip: true });
    expect(drafts.rows[1]).toMatchObject({ origin: "STAFF", hasRg: false, hasPayslip: false });
    await attachTestDocuments(attendant, staff.formId);
    expect((await listAffiliationForms({ status: "DRAFT", page: 1, order: "antigas" })).rows[1]).toMatchObject({ hasRg: true, hasPayslip: true });

    // Resolver cada item tira ele da fila e do contador.
    await decideAffiliation(attendant, { registrationId: member.registrationId, decision: "CONFIRM" });
    await formalizeAffiliation(attendant, drafts.rows[0]!.id);
    await cancelAffiliationForm(attendant, staff.formId);
    expect(await queueCounts()).toEqual({ pending: 0, signature: 0 });
    expect((await listVerificationQueue({ kind: "PENDING", page: 1 })).rows).toHaveLength(0);
    expect((await getDashboardStats(db)).draftForms).toBe(0);
  });

  it("inscrições: mais recentes primeiro por padrão (fila e lista), mais antigas quando pedido; conta as de hoje", async () => {
    const primeira = await registerMember({ memberName: "Alice Primeira Rocha" });
    await registerMember({ memberName: "Bruna Segunda Rocha" });
    await registerMember({ memberName: "Carla Terceira Rocha" });
    const names = (rows: { fullName: string }[]) => rows.map((row) => row.fullName);

    expect(names((await listVerificationQueue({ kind: "PENDING", page: 1 })).rows)).toEqual([
      "Carla Terceira Rocha",
      "Bruna Segunda Rocha",
      "Alice Primeira Rocha",
    ]);
    expect(names((await listVerificationQueue({ kind: "PENDING", page: 1, order: "antigas" })).rows)).toEqual([
      "Alice Primeira Rocha",
      "Bruna Segunda Rocha",
      "Carla Terceira Rocha",
    ]);
    await decideAffiliation(attendant, { registrationId: primeira.registrationId, decision: "CONFIRM" });
    expect(names((await listRegistrations({ page: 1 })).rows)).toEqual(["Carla Terceira Rocha", "Bruna Segunda Rocha", "Alice Primeira Rocha"]);
    expect(names((await listRegistrations({ page: 1, order: "antigas" })).rows)[0]).toBe("Alice Primeira Rocha");
    expect(listOrder("antigas")).toBe("antigas");
    expect(listOrder("qualquer coisa")).toBe("recentes");
    expect(await registrationStatusCounts()).toMatchObject({ total: 3, today: 3, byStatus: { PENDING: 2, CONFIRMED: 1 } });
  });

  it("lista unificada: acha o grupo pelo convidado, mostra quem já entrou e filtra quem ainda não entrou", async () => {
    const group = await registerMember({ guest: true, memberName: "Maria Grupo Souza", guestName: "Luiza Convidada Lima" });
    const solo = await registerMember({ memberName: "Joana Sozinha Reis" });
    const rejected = await registerMember({ memberName: "Rita Recusada Alves" });
    await decideAffiliation(attendant, { registrationId: group.registrationId, decision: "CONFIRM" });
    await decideAffiliation(attendant, { registrationId: solo.registrationId, decision: "CONFIRM" });
    await decideAffiliation(attendant, { registrationId: rejected.registrationId, decision: "REJECT" });

    // Buscar pelo convidado encontra a linha do grupo (com o WhatsApp de quem se inscreveu).
    const byGuest = await listRegistrations({ page: 1, q: "luiza" });
    expect(byGuest.rows).toHaveLength(1);
    expect(byGuest.rows[0]).toMatchObject({ fullName: "Maria Grupo Souza", guestName: "Luiza Convidada Lima", guestPersonId: group.state.guest!.personId });
    expect(byGuest.rows[0]!.whatsapp).toBeTruthy();

    // "Ainda não entraram": só inscrições válidas (a recusada fica de fora).
    const absent = async () => (await listRegistrations({ page: 1, absent: true })).rows.map((row) => row.fullName).sort();
    expect(await absent()).toEqual(["Joana Sozinha Reis", "Maria Grupo Souza"]);
    // Ninguém entrou ainda: é o que decide mostrar (ou não) o filtro antes da festa.
    expect(await hasAnyEntry()).toBe(false);

    // O convidado entrou antes: o grupo continua na lista, porque falta a professora.
    await registerCheckIn(attendant, { personId: group.state.guest!.personId, method: "SEARCH" });
    await registerCheckIn(attendant, { personId: solo.state.member.id, method: "QR" });
    expect(await absent()).toEqual(["Maria Grupo Souza"]);
    expect(await hasAnyEntry()).toBe(true);
    const row = (await listRegistrations({ page: 1, q: "maria grupo" })).rows[0]!;
    expect(row.checkedInAt).toBeNull();
    expect(row.guestCheckedInAt).toBeTruthy();

    // Os dois dentro: sai da lista.
    await registerCheckIn(attendant, { personId: group.state.member.id, method: "QR" });
    expect(await absent()).toEqual([]);
    expect((await listRegistrations({ page: 1, q: "maria grupo" })).rows[0]!.checkedInAt).toBeTruthy();
  });
});
