/**
 * Cópia do RG e do contracheque na ficha de filiação: obrigatórias para
 * confirmar a filiação, cifradas no banco e só para a equipe.
 */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { affiliationDocument, affiliationForm, auditLog } from "@/server/db/schema";
import { preAffiliationSchema } from "@/domain/schemas";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { listFormDocuments, readDocument, removeDocument, storeDocument } from "@/server/services/documents";
import { DomainError } from "@/server/services/errors";
import { formalizeAffiliation, saveAffiliationForm } from "@/server/services/membership";
import { createPreAffiliation } from "@/server/services/registration";
import {
  attachTestDocuments,
  configureEvent,
  createStaff,
  preAffiliationInput,
  randomCpf,
  registerPreAffiliation,
  resetDatabase,
  staffFicha,
  TEST_PDF,
  uploadTestDocuments,
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

async function formOf(registrationId: string) {
  const [form] = await db.select().from(affiliationForm).where(eq(affiliationForm.registrationId, registrationId));
  return form!;
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin);
});

describe("ficha pelo site", () => {
  it("exige RG e contracheque", () => {
    const input = preAffiliationInput();
    expect(preAffiliationSchema.safeParse({ ...input, documents: { rg: [], payslip: input.documents.payslip } }).success).toBe(false);
    expect(preAffiliationSchema.safeParse({ ...input, documents: { rg: input.documents.rg, payslip: [] } }).success).toBe(false);
    expect(preAffiliationSchema.safeParse(input).success).toBe(true);
  });

  it("liga os arquivos enviados à ficha; envio inexistente pede para enviar de novo", async () => {
    const pre = await registerPreAffiliation();
    const form = await formOf(pre.registrationId);
    const docs = await listFormDocuments(db, form.id);
    expect(docs.map((d) => d.kind).sort()).toEqual(["PAYSLIP", "RG"]);

    const expired = preAffiliationInput();
    expired.documents = { rg: [randomUUID()], payslip: (await uploadTestDocuments()).payslip };
    const error = await expectDomainError(createPreAffiliation(PUBLIC_ACTOR, expired), "VALIDATION");
    expect(error.fieldErrors?.["documents.rg"]).toMatch(/Envie este documento de novo/);
  });

  it("arquivo de uma ficha não pode ser reaproveitado em outra", async () => {
    const pre = await registerPreAffiliation();
    const form = await formOf(pre.registrationId);
    const taken = (await listFormDocuments(db, form.id)).find((d) => d.kind === "RG")!;
    const other = preAffiliationInput();
    other.documents = { rg: [taken.id], payslip: (await uploadTestDocuments()).payslip };
    await expectDomainError(createPreAffiliation(PUBLIC_ACTOR, other), "VALIDATION");
  });
});

describe("assinatura na recepção", () => {
  it("a assinatura só é confirmada com RG e contracheque anexados", async () => {
    const cpf = randomCpf();
    const saved = await saveAffiliationForm(attendant, staffFicha({ cpf, fullName: "Beatriz Nova Silva" }));
    const missing = await expectDomainError(formalizeAffiliation(attendant, saved.formId), "INVALID_STATE");
    expect(missing.message).toBe("Faltam documentos: RG e Contracheque. Anexe na ficha antes de confirmar a assinatura.");

    await storeDocument(attendant, { kind: "RG", bytes: TEST_PDF, type: "application/pdf", formId: saved.formId });
    const stillMissing = await expectDomainError(formalizeAffiliation(attendant, saved.formId), "INVALID_STATE");
    expect(stillMissing.message).toMatch(/Faltam documentos: Contracheque/);

    await storeDocument(attendant, { kind: "PAYSLIP", bytes: TEST_PDF, type: "application/pdf", formId: saved.formId });
    const signed = await formalizeAffiliation(attendant, saved.formId);
    expect(signed.registrationId).toBeTruthy();
  });

  it("a ficha do Atendimento já pode levar os documentos ao ser gravada", async () => {
    const documents = await uploadTestDocuments(attendant);
    const saved = await saveAffiliationForm(attendant, { ...staffFicha({ cpf: randomCpf(), fullName: "Carlos Novo Lima" }), documents });
    expect((await listFormDocuments(db, saved.formId)).length).toBe(2);
    await formalizeAffiliation(attendant, saved.formId);
  });
});

describe("segurança dos arquivos", () => {
  it("o arquivo fica cifrado no banco e só a equipe de atendimento abre", async () => {
    const pre = await registerPreAffiliation();
    const form = await formOf(pre.registrationId);
    const [doc] = await listFormDocuments(db, form.id);
    const [raw] = await db.select({ data: affiliationDocument.data }).from(affiliationDocument).where(eq(affiliationDocument.id, doc!.id));
    expect(raw!.data.includes(Buffer.from("%PDF"))).toBe(false);

    const opened = await readDocument(attendant, doc!.id);
    expect(opened.bytes.equals(TEST_PDF)).toBe(true);
    expect(opened.contentType).toBe("application/pdf");
    await expectDomainError(readDocument(security, doc!.id), "FORBIDDEN");
    await expectDomainError(readDocument(PUBLIC_ACTOR, doc!.id), "UNAUTHENTICATED");
  });

  it("foto vira JPEG reduzido e sem metadados; a miniatura não entra na auditoria", async () => {
    const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3366aa" } })
      .withMetadata({ exif: { IFD0: { Artist: "Teste GPS" } } })
      .png()
      .toBuffer();
    const saved = await saveAffiliationForm(attendant, staffFicha({ cpf: randomCpf(), fullName: "Diana Foto Rocha" }));
    const stored = await storeDocument(attendant, { kind: "RG", bytes: photo, type: "image/png", formId: saved.formId });
    expect(stored.contentType).toBe("image/jpeg");
    const opened = await readDocument(attendant, stored.id);
    const meta = await sharp(opened.bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(2000);
    expect(meta.exif).toBeUndefined();
    const thumb = await readDocument(attendant, stored.id, { thumbnail: true });
    expect((await sharp(thumb.bytes).metadata()).width).toBeLessThanOrEqual(360);

    const views = await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.action, "DOCUMENT_VIEWED"));
    expect(views).toHaveLength(1);
  });

  it("recusa arquivo que não é foto nem PDF", async () => {
    await expectDomainError(storeDocument(PUBLIC_ACTOR, { kind: "RG", bytes: Buffer.from("olá"), type: "text/plain" }), "VALIDATION");
    await expectDomainError(
      storeDocument(PUBLIC_ACTOR, { kind: "RG", bytes: Buffer.from("não sou imagem"), type: "image/jpeg" }),
      "VALIDATION",
    );
  });

  it("envios soltos (formulário abandonado) somem depois de um dia", async () => {
    const old = await uploadTestDocuments();
    await db
      .update(affiliationDocument)
      .set({ createdAt: sql`now() - interval '25 hours'` })
      .where(eq(affiliationDocument.id, old.rg[0]!));
    await uploadTestDocuments();
    const [row] = await db.select({ id: affiliationDocument.id }).from(affiliationDocument).where(eq(affiliationDocument.id, old.rg[0]!));
    expect(row).toBeUndefined();
  });

  it("depois da assinatura, só o administrador apaga documento", async () => {
    const saved = await saveAffiliationForm(attendant, staffFicha({ cpf: randomCpf(), fullName: "Elisa Apaga Souza" }));
    await attachTestDocuments(attendant, saved.formId);
    const [first] = await listFormDocuments(db, saved.formId);
    // Na ficha em aberto, o Atendimento troca a foto.
    await removeDocument(attendant, first!.id);
    await attachTestDocuments(attendant, saved.formId);
    await formalizeAffiliation(attendant, saved.formId);
    const [signedDoc] = await listFormDocuments(db, saved.formId);
    await expectDomainError(removeDocument(attendant, signedDoc!.id), "FORBIDDEN");
    await removeDocument(admin, signedDoc!.id);
  });
});
