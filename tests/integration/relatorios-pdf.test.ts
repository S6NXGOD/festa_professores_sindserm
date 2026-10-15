/**
 * Relatórios em PDF de cada área (kits, inscrições, colaboradores, cortesias,
 * fichas e entradas): saem com as contas das telas, nomes com acento e CPF
 * sempre mascarado. O texto do PDF é lido de volta para conferir.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { KitPlan } from "@/domain/kit-plan";
import { REPORT_TYPES, type ReportType } from "@/domain/reports";
import { formatCpf, maskCpf } from "@/lib/cpf";
import { buildReport, type ReportContext } from "@/server/reports/build-report";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { createEmployee } from "@/server/services/employees";
import { updateKitPlan } from "@/server/services/kit-plan";
import { configureEvent, createStaff, personName, registerMember, registerPreAffiliation, resetDatabase } from "../helpers/factories";

const context: ReportContext = {
  eventName: "Festa das Professoras e Professores – SINDSERMTHE 2026",
  eventLine: "Sexta-feira, 16 de outubro de 2026 · 19h às 2h",
  kitDeadline: { label: "22:30", passed: false },
  eventStart: null,
  generatedBy: "Ana Administradora",
};

const plan: KitPlan = {
  items: [
    { id: "cerveja", name: "Cerveja", priceCents: 500 },
    { id: "refri", name: "Refrigerante", priceCents: 400 },
    { id: "petisco", name: "Petisco", priceCents: null },
  ],
  kits: { MEMBER: [{ itemId: "cerveja", quantity: 2 }, { itemId: "petisco", quantity: 1 }], GUEST: null, EMPLOYEE: null, EMPLOYEE_GUEST: null, COURTESY: null },
  minor: [{ itemId: "refri", quantity: 2 }],
};

/** Gera o PDF e devolve o texto (com REPORT_PDF_DIR, guarda o arquivo para olhar). */
async function read(type: ReportType) {
  const bytes = await buildReport(type, context);
  if (process.env.REPORT_PDF_DIR) {
    mkdirSync(process.env.REPORT_PDF_DIR, { recursive: true });
    writeFileSync(join(process.env.REPORT_PDF_DIR, `${type}.pdf`), bytes);
  }
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { magic: Buffer.from(bytes.slice(0, 5)).toString("latin1"), text: text.replace(/\s+/g, " "), pages: totalPages, size: bytes.length };
}

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sérgio Segurança");
  await configureEvent(admin, { stockMode: "SINGLE", totalAll: 3, totalEmployee: 5, lowStockThreshold: 0, kitDeadlineTime: "22:30" });
});

describe("relatórios em PDF", () => {
  it("cada área gera o seu, com as contas da tela, nomes com acento e CPF mascarado", async () => {
    await updateKitPlan(admin, plan);
    const joana = await registerMember({ memberName: "Joana Conceição Araújo", guest: true, guestName: "Lúcio Araújo" });
    await decideAffiliation(attendant, { registrationId: joana.registrationId, decision: "CONFIRM" });
    await registerCheckIn(security, { personId: joana.state.member.id, method: "QR" });
    await registerMember({ memberName: "Bruno Pendente Sá" });
    // 3 kits: Joana, o convidado dela e o Bruno. A Carla já entra na fila do kit.
    await registerMember({ memberName: "Carla Fila do Kit" });
    await createEmployee(admin, { fullName: "Rosa Financeiro Lima", cpf: "", whatsapp: "", jobTitle: "Financeiro", guest: null });
    await createEmployee(admin, { fullName: "Vera Dias Cortesia", cpf: "", whatsapp: "", jobTitle: "Presidência", category: "COURTESY", withKit: false, guest: null });
    await registerPreAffiliation({ fullName: "Rafaela Nova Filiada" });

    const kits = await read("kits");
    expect(kits.magic).toBe("%PDF-");
    expect(kits.text).toContain("KITS E ESTOQUE");
    expect(kits.text).toContain("Festa das Professoras e Professores – SINDSERMTHE 2026");
    expect(kits.text).toContain("Kits guardados até as 22:30");
    expect(kits.text).toContain("PESSOAS E KITS");
    expect(kits.text).toContain("Professoras e professores");
    expect(kits.text).toContain("Carla Fila do Kit");
    expect(kits.text).toContain("MONTAGEM E CUSTO");
    expect(kits.text).toContain("2 Cerveja · 1 Petisco");
    expect(kits.text).toContain("sem preço");
    expect(kits.text).toContain("Página 1 de");

    const registrations = await read("inscricoes");
    expect(registrations.text).toContain("Joana Conceição Araújo");
    expect(registrations.text).toContain("Lúcio Araújo");
    expect(registrations.text).toContain(maskCpf(joana.input.member.cpf));
    // CPF completo nunca vai para o papel.
    expect(registrations.text).not.toContain(formatCpf(joana.input.member.cpf));
    expect(registrations.text).toContain("Fila do kit");
    expect(registrations.text).toContain("Entregue");

    const collaborators = await read("colaboradores");
    expect(collaborators.text).toContain("Rosa Financeiro Lima");
    expect(collaborators.text).toContain("Financeiro");
    expect(collaborators.text).not.toContain("Vera Dias Cortesia");

    const courtesies = await read("cortesias");
    expect(courtesies.text).toContain("Convite: Presidência".toUpperCase());
    expect(courtesies.text).toContain("Vera Dias Cortesia");
    expect(courtesies.text).toContain("Sem kit");

    const forms = await read("fichas");
    expect(forms.text).toContain("Rafaela Nova Filiada");
    expect(forms.text).toContain("Para assinar");
    expect(forms.text).toContain("RG · contracheque");

    const entries = await read("entradas");
    expect(entries.text).toContain("Joana Conceição Araújo");
    expect(entries.text).toContain("Sérgio Segurança");
    expect(entries.text).toContain("QR Code");
  });

  it("sem nada cadastrado, todos saem (com o aviso de lista vazia)", async () => {
    for (const type of REPORT_TYPES) {
      const report = await read(type);
      expect(report.magic, type).toBe("%PDF-");
      expect(report.pages, type).toBeGreaterThanOrEqual(1);
      // Fontes embutidas em subconjunto: o arquivo fica leve para o WhatsApp.
      expect(report.size, type).toBeLessThan(250_000);
    }
    expect((await read("entradas")).text).toContain("Ninguém entrou ainda.");
    expect((await read("inscricoes")).text).toContain("Nenhuma inscrição ainda.");
  });

  it("lista grande quebra em várias páginas, com o cabeçalho da tabela em cada uma", async () => {
    for (let index = 0; index < 70; index++) await registerMember({ memberName: personName(index, "Professora") });
    const registrations = await read("inscricoes");
    expect(registrations.pages).toBeGreaterThan(1);
    expect(registrations.text.match(/QUEM SE INSCREVEU/g)?.length).toBe(registrations.pages);
    expect(registrations.text).toContain(`Página ${registrations.pages} de ${registrations.pages}`);
  });
});
