/**
 * Ficha assinada pelo gov.br (antes da festa) e prévia dos documentos: o link
 * assinado da ficha, o PDF da ficha, a miniatura e as páginas do PDF, quem pode
 * anexar a ficha assinada e a confirmação que efetiva a filiação.
 */
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { affiliationDocument, auditLog, registration } from "@/server/db/schema";
import { buildFichaPdf, fichaFileName } from "@/server/pdf/ficha-pdf";
import { getAffiliationForm, listAffiliationForms } from "@/server/queries/panel";
import { findDraftFormId } from "@/server/queries/vouchers";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { readDocument, storeDocument } from "@/server/services/documents";
import { DomainError } from "@/server/services/errors";
import { formalizeAffiliation } from "@/server/services/membership";
import { readSigningToken, SIGNING_LINK_DAYS, signingToken } from "@/server/signing-link";
import { configureEvent, createStaff, registerPreAffiliation, resetDatabase, TEST_PDF } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin);
});

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeInstanceOf(DomainError);
  return error as DomainError;
}

/** Ficha do site esperando assinatura, com RG e contracheque (do jeito que o site manda). */
async function draftForm() {
  const created = await registerPreAffiliation({ fullName: "Beatriz Nova Filiada" });
  const formId = (await findDraftFormId(created.state.member.id))!;
  const data = (await getAffiliationForm(formId))!;
  return { created, formId, form: data.form };
}

/** Um PDF de verdade, com páginas (o do teste padrão é só um cabeçalho). */
async function realPdf(pages = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]).drawText(`Pagina ${i + 1}`, { x: 60, y: 760, size: 24 });
  return Buffer.from(await doc.save());
}

describe("link para assinar pelo gov.br", () => {
  it("abre a ficha certa; alterado, de outra ficha ou vencido não abre", () => {
    const formId = "1f58d840-5f81-4c2e-b1b2-9053595c7d4e";
    const now = new Date("2026-09-29T12:00:00Z");
    const token = signingToken(formId, now);
    expect(readSigningToken(token, now)).toBe(formId);
    const [, expires, signature] = token.split(".");
    expect(readSigningToken(`2f58d840-5f81-4c2e-b1b2-9053595c7d4e.${expires}.${signature}`, now)).toBeNull();
    expect(readSigningToken(`${formId}.${expires}.${signature!.replace(/.$/, (c) => (c === "A" ? "B" : "A"))}`, now)).toBeNull();
    expect(readSigningToken(`${formId}.zzzzzz.${signature}`, now)).toBeNull();
    const later = new Date(now.getTime() + (SIGNING_LINK_DAYS + 1) * 86_400_000);
    expect(readSigningToken(token, later)).toBeNull();
    expect(readSigningToken("qualquer-coisa", now)).toBeNull();
  });
});

describe("ficha em PDF", () => {
  it("gera um PDF de uma página, com o nome no arquivo", async () => {
    const { form } = await draftForm();
    const bytes = await buildFichaPdf(form);
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
    expect(parsed.getTitle()).toBe("Ficha de filiação — Beatriz Nova Filiada");
    expect(fichaFileName("Beatriz Nova Filiada")).toBe("ficha-filiacao-beatriz-nova-filiada.pdf");
    expect(fichaFileName("João D'Ávila")).toBe("ficha-filiacao-joao-d-avila.pdf");
  });
});

describe("prévia dos documentos", () => {
  it("PDF de verdade: miniatura guardada no envio, páginas no visualizador (a 1ª fica na auditoria)", async () => {
    const { formId } = await draftForm();
    const stored = await storeDocument(attendant, { kind: "PAYSLIP", bytes: await realPdf(2), type: "application/pdf", formId });
    expect(stored.pageCount).toBe(2);
    const [row] = await db.select().from(affiliationDocument).where(eq(affiliationDocument.id, stored.id));
    expect(row!.preview).not.toBeNull();

    const thumb = await readDocument(attendant, stored.id, { thumbnail: true });
    expect(thumb.contentType).toBe("image/jpeg");
    expect(thumb.pages).toBe(2);
    expect(thumb.bytes.subarray(0, 2).toString("hex")).toBe("ffd8");

    const page2 = await readDocument(attendant, stored.id, { page: 2 });
    expect(page2).toMatchObject({ contentType: "image/jpeg", pages: 2 });
    expect((await refused(readDocument(attendant, stored.id, { page: 3 }))).code).toBe("NOT_FOUND");

    await readDocument(attendant, stored.id, { page: 1 });
    const views = await db.select().from(auditLog).where(and(eq(auditLog.action, "DOCUMENT_VIEWED"), eq(auditLog.entityId, formId)));
    expect(views.map((v) => v.summary)).toEqual(["Contracheque da ficha de Beatriz Nova Filiada aberto no visualizador."]);
    // Quem não vê fichas não vê nem a miniatura.
    expect((await refused(readDocument(security, stored.id, { thumbnail: true }))).code).toBe("FORBIDDEN");
  });

  it("PDF que não abre: sem prévia (a tela mostra o ícone), mas o arquivo continua lá", async () => {
    const { formId } = await draftForm();
    const stored = await storeDocument(attendant, { kind: "RG", bytes: TEST_PDF, type: "application/pdf", formId });
    expect(stored.pageCount).toBeNull();
    expect((await refused(readDocument(attendant, stored.id, { thumbnail: true }))).code).toBe("NOT_FOUND");
    expect((await readDocument(attendant, stored.id)).contentType).toBe("application/pdf");
  });

  it("PDF enviado antes das prévias: gera na primeira vez e guarda", async () => {
    const { formId } = await draftForm();
    const stored = await storeDocument(attendant, { kind: "PAYSLIP", bytes: await realPdf(1), type: "application/pdf", formId });
    await db.update(affiliationDocument).set({ preview: null, pageCount: null }).where(eq(affiliationDocument.id, stored.id));
    expect((await readDocument(attendant, stored.id, { thumbnail: true })).pages).toBe(1);
    const [row] = await db.select().from(affiliationDocument).where(eq(affiliationDocument.id, stored.id));
    expect(row).toMatchObject({ pageCount: 1 });
    expect(row!.preview).not.toBeNull();
  });
});

describe("ficha assinada pelo gov.br", () => {
  it("só a equipe anexa, direto na ficha, e só PDF", async () => {
    const { formId } = await draftForm();
    expect((await refused(storeDocument(PUBLIC_ACTOR, { kind: "SIGNED_FORM", bytes: await realPdf(), type: "application/pdf" }))).code).toBe(
      "FORBIDDEN",
    );
    expect((await refused(storeDocument(security, { kind: "SIGNED_FORM", bytes: await realPdf(), type: "application/pdf", formId }))).code).toBe(
      "FORBIDDEN",
    );
    const sharp = (await import("sharp")).default;
    const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const notPdf = await refused(storeDocument(attendant, { kind: "SIGNED_FORM", bytes: photo, type: "image/jpeg", formId }));
    expect(notPdf.message).toContain("PDF");
    const signed = await storeDocument(attendant, { kind: "SIGNED_FORM", bytes: await realPdf(), type: "application/pdf", formId });
    expect(signed.kind).toBe("SIGNED_FORM");

    const list = await listAffiliationForms({ status: "DRAFT", page: 1 });
    expect(list.rows[0]).toMatchObject({ hasRg: true, hasPayslip: true, hasSignedForm: true });
    expect(list.rows[0]!.documents.map((doc) => doc.kind)).toEqual(["RG", "PAYSLIP", "SIGNED_FORM"]);
  });

  it("confirmar pelo gov.br exige o PDF assinado; confirmado, a filiação vale e fica registrado como gov.br", async () => {
    const { formId, created } = await draftForm();
    const missing = await refused(formalizeAffiliation(attendant, formId, "GOVBR"));
    expect(missing.message).toContain("Anexe a ficha assinada pelo gov.br");

    await storeDocument(attendant, { kind: "SIGNED_FORM", bytes: Buffer.from(await buildFichaPdf((await getAffiliationForm(formId))!.form)), type: "application/pdf", formId });
    await formalizeAffiliation(attendant, formId, "GOVBR");

    const [reg] = await db.select().from(registration).where(eq(registration.id, created.registrationId));
    expect(reg).toMatchObject({ status: "JOINED_AT_EVENT", statusNote: "Ficha de filiação assinada pelo gov.br" });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "AFFILIATION_FORMALIZED"));
    expect(audit!.summary).toBe("Ficha de filiação de Beatriz Nova Filiada assinada pelo gov.br.");
    // A ficha não espera mais assinatura: o link para de levar à ficha.
    expect(await findDraftFormId(created.state.member.id)).toBeNull();
  });

  it("no papel continua como antes (sem exigir o PDF do gov.br)", async () => {
    const { formId, created } = await draftForm();
    await formalizeAffiliation(attendant, formId);
    const [reg] = await db.select().from(registration).where(eq(registration.id, created.registrationId));
    expect(reg).toMatchObject({ status: "JOINED_AT_EVENT", statusNote: "Ficha de filiação assinada na festa" });
  });
});
