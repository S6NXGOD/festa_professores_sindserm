/**
 * Filas do Atendimento: o que o menu, as páginas e o placar contam como
 * trabalho a fazer — inscrições para conferir (em Inscrições) e fichas para
 * assinar (em Fichas de filiação).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listAffiliationForms, listVerificationQueue, queueCounts } from "@/server/queries/panel";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
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

    // Fila de assinatura: quem espera há mais tempo primeiro, com a situação dos documentos.
    const drafts = await listAffiliationForms({ status: "DRAFT", page: 1 });
    expect(drafts.rows.map((row) => row.fullName)).toEqual(["Daniel Ficha Site", "Elisa Ficha Balcao"]);
    expect(drafts.rows[0]).toMatchObject({ origin: "PUBLIC", hasRg: true, hasPayslip: true });
    expect(drafts.rows[1]).toMatchObject({ origin: "STAFF", hasRg: false, hasPayslip: false });
    await attachTestDocuments(attendant, staff.formId);
    expect((await listAffiliationForms({ status: "DRAFT", page: 1 })).rows[1]).toMatchObject({ hasRg: true, hasPayslip: true });

    // Resolver cada item tira ele da fila e do contador.
    await decideAffiliation(attendant, { registrationId: member.registrationId, decision: "CONFIRM" });
    await formalizeAffiliation(attendant, drafts.rows[0]!.id);
    await cancelAffiliationForm(attendant, staff.formId);
    expect(await queueCounts()).toEqual({ pending: 0, signature: 0 });
    expect((await listVerificationQueue({ kind: "PENDING", page: 1 })).rows).toHaveLength(0);
    expect((await getDashboardStats(db)).draftForms).toBe(0);
  });
});
