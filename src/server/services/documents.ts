import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, type Executor, type Tx } from "@/server/db";
import { affiliationDocument, affiliationForm, user } from "@/server/db/schema";
import { DOCUMENT_KIND_LABEL } from "@/domain/labels";
import { can } from "@/domain/rules";
import { MAX_FILES_PER_DOCUMENT } from "@/domain/schemas";
import type { DocumentKind } from "@/domain/types";
import { decryptBytes, encryptBytes } from "@/server/crypto";
import { PAGE_WIDTH, PdfPreviewError, PREVIEW_WIDTH, renderPdfPage } from "@/server/pdf/render";
import { type Actor, actorUserId, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { DomainError } from "./errors";
import { withTx } from "./tx";

/*
 * Cópias do RG e do contracheque da ficha de filiação. São dados sensíveis
 * (identidade e salário): o arquivo fica cifrado no banco, só Atendimento e
 * administradores abrem, e fotos perdem os metadados (EXIF/GPS).
 */

/** Tamanho máximo recebido (o navegador reduz as fotos antes de enviar). */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const PDF_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MAX_SIDE = 2000;
const THUMB_SIDE = 360;

export type StoredContentType = "image/jpeg" | "application/pdf";

export interface DocumentMeta {
  id: string;
  kind: DocumentKind;
  contentType: StoredContentType;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: string | null;
  /** PDF: páginas (nulo enquanto a prévia não foi gerada). */
  pageCount: number | null;
}

const aadFor = (id: string) => `document:${id}`;
const previewAadFor = (id: string) => `document-preview:${id}`;

/** Prévia da 1ª página de um PDF (para guardar cifrada). PDF que não abre: sem prévia (a tela mostra o ícone). */
async function pdfPreview(bytes: Buffer): Promise<{ jpeg: Buffer; pages: number } | null> {
  try {
    return await renderPdfPage(bytes, 1, PREVIEW_WIDTH);
  } catch {
    return null;
  }
}

function isPdf(bytes: Buffer) {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Foto: corrige a rotação, reduz e grava em JPEG sem metadados. PDF: guarda como veio. */
async function normalizeDocument(upload: { bytes: Buffer; type: string }): Promise<{ data: Buffer; contentType: StoredContentType }> {
  if (upload.bytes.length === 0) throw new DomainError("VALIDATION", "O arquivo está vazio.");
  if (upload.bytes.length > DOCUMENT_MAX_BYTES) throw new DomainError("VALIDATION", "Arquivo grande demais (máximo 10 MB).");
  if (isPdf(upload.bytes)) {
    if (upload.bytes.length > PDF_MAX_BYTES) throw new DomainError("VALIDATION", "PDF grande demais (máximo 8 MB).");
    return { data: upload.bytes, contentType: "application/pdf" };
  }
  if (upload.type === "application/pdf") throw new DomainError("VALIDATION", "Este PDF parece estar corrompido. Tente outro arquivo.");
  if (upload.type && !upload.type.startsWith("image/")) {
    throw new DomainError("VALIDATION", "Envie uma foto (JPG ou PNG) ou um PDF.");
  }
  const { default: sharp } = await import("sharp");
  try {
    const data = await sharp(upload.bytes, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { data, contentType: "image/jpeg" };
  } catch {
    throw new DomainError("VALIDATION", "Não foi possível ler a foto. Tire de novo ou envie em JPG ou PDF.");
  }
}

async function lockOpenForm(tx: Tx, formId: string) {
  const [form] = await tx
    .select({ id: affiliationForm.id, status: affiliationForm.status, fullName: affiliationForm.fullName })
    .from(affiliationForm)
    .where(eq(affiliationForm.id, formId))
    .for("update");
  if (!form) throw new DomainError("NOT_FOUND", "Ficha não encontrada.");
  if (form.status === "CANCELLED") throw new DomainError("INVALID_STATE", "Esta ficha foi cancelada.");
  return form;
}

/**
 * Guarda um documento. Com `formId` (Atendimento), já entra na ficha. Sem
 * ficha (formulário público), fica pendente até a ficha ser gravada; envios
 * que não viraram ficha são apagados depois de um dia.
 */
export async function storeDocument(
  actor: Actor,
  input: { kind: DocumentKind; bytes: Buffer; type: string; formId?: string | null },
): Promise<DocumentMeta> {
  if (input.formId) assertPermission(actor, "newAffiliation");
  // A ficha assinada pelo gov.br chega no WhatsApp da secretaria: só a equipe anexa, direto na ficha.
  if (input.kind === "SIGNED_FORM" && !input.formId) throw new DomainError("FORBIDDEN", "A ficha assinada é anexada pela equipe, na ficha.");
  const { data, contentType } = await normalizeDocument(input);
  if (input.kind === "SIGNED_FORM" && contentType !== "application/pdf") {
    throw new DomainError("VALIDATION", "A ficha assinada pelo gov.br é um arquivo PDF. Envie o PDF que a pessoa mandou.");
  }
  const id = randomUUID();
  const preview = contentType === "application/pdf" ? await pdfPreview(data) : null;
  return withTx(async (tx) => {
    let form: { id: string; fullName: string } | null = null;
    if (input.formId) {
      form = await lockOpenForm(tx, input.formId);
      const [existing] = await tx
        .select({ total: count() })
        .from(affiliationDocument)
        .where(and(eq(affiliationDocument.formId, form.id), eq(affiliationDocument.kind, input.kind)));
      if (Number(existing?.total ?? 0) >= MAX_FILES_PER_DOCUMENT) {
        throw new DomainError("VALIDATION", `No máximo ${MAX_FILES_PER_DOCUMENT} arquivos de ${DOCUMENT_KIND_LABEL[input.kind]}.`);
      }
    }
    const [row] = await tx
      .insert(affiliationDocument)
      .values({
        id,
        formId: form?.id ?? null,
        kind: input.kind,
        contentType,
        sizeBytes: data.length,
        data: encryptBytes(data, aadFor(id)),
        preview: preview ? encryptBytes(preview.jpeg, previewAadFor(id)) : null,
        pageCount: preview?.pages ?? null,
        uploadedByUserId: actorUserId(actor),
      })
      .returning({ createdAt: affiliationDocument.createdAt });
    if (form) {
      await writeAudit(tx, actor, {
        action: "DOCUMENT_ATTACHED",
        entityType: "affiliation_form",
        entityId: form.id,
        summary: `${DOCUMENT_KIND_LABEL[input.kind]} anexado à ficha de ${form.fullName}.`,
        after: { documentId: id, kind: input.kind, contentType },
      });
    }
    // Envios soltos (formulário abandonado) não ficam guardados.
    await tx
      .delete(affiliationDocument)
      .where(and(isNull(affiliationDocument.formId), lt(affiliationDocument.createdAt, sql`now() - interval '24 hours'`)));
    return {
      id,
      kind: input.kind,
      contentType,
      sizeBytes: data.length,
      createdAt: row!.createdAt,
      uploadedBy: actor.kind === "staff" ? actor.name : null,
      pageCount: preview?.pages ?? null,
    };
  });
}

/**
 * Liga à ficha os documentos enviados pelo formulário. Envio que não existe
 * mais (expirou), de outro tipo ou de outra ficha é recusado com a mensagem no
 * campo certo, para a pessoa enviar de novo.
 */
export async function linkDocumentsToForm(tx: Tx, formId: string, documents: { rg: string[]; payslip: string[] }) {
  const wanted = [
    ...documents.rg.map((id) => ({ id, kind: "RG" as const, field: "documents.rg" })),
    ...documents.payslip.map((id) => ({ id, kind: "PAYSLIP" as const, field: "documents.payslip" })),
  ];
  if (wanted.length === 0) return;
  const ids = [...new Set(wanted.map((w) => w.id))];
  const rows = await tx
    .select({ id: affiliationDocument.id, kind: affiliationDocument.kind, formId: affiliationDocument.formId })
    .from(affiliationDocument)
    .where(inArray(affiliationDocument.id, ids))
    .for("update");
  const byId = new Map(rows.map((row) => [row.id, row]));
  const fieldErrors: Record<string, string> = {};
  for (const w of wanted) {
    const row = byId.get(w.id);
    if (!row || row.kind !== w.kind || (row.formId !== null && row.formId !== formId)) {
      fieldErrors[w.field] = "Envie este documento de novo (o envio anterior expirou).";
    }
  }
  if (Object.keys(fieldErrors).length) {
    throw new DomainError("VALIDATION", "Um dos documentos precisa ser enviado de novo.", fieldErrors);
  }
  await tx
    .update(affiliationDocument)
    .set({ formId })
    .where(and(inArray(affiliationDocument.id, ids), isNull(affiliationDocument.formId)));
}

export async function listFormDocuments(ex: Executor, formId: string): Promise<DocumentMeta[]> {
  const rows = await ex
    .select({
      id: affiliationDocument.id,
      kind: affiliationDocument.kind,
      contentType: affiliationDocument.contentType,
      sizeBytes: affiliationDocument.sizeBytes,
      createdAt: affiliationDocument.createdAt,
      uploadedBy: user.name,
      pageCount: affiliationDocument.pageCount,
    })
    .from(affiliationDocument)
    .leftJoin(user, eq(user.id, affiliationDocument.uploadedByUserId))
    .where(eq(affiliationDocument.formId, formId))
    .orderBy(asc(affiliationDocument.kind), asc(affiliationDocument.createdAt));
  return rows.map((row) => ({ ...row, contentType: row.contentType as StoredContentType }));
}

/** A ficha tem o PDF assinado pelo gov.br? (exigido para confirmar a assinatura digital) */
export async function hasSignedForm(ex: Executor, formId: string): Promise<boolean> {
  const [row] = await ex
    .select({ total: count() })
    .from(affiliationDocument)
    .where(and(eq(affiliationDocument.formId, formId), eq(affiliationDocument.kind, "SIGNED_FORM")));
  return Number(row?.total ?? 0) > 0;
}

/** A ficha tem RG e contracheque? (exigido para confirmar a assinatura) */
export async function missingDocuments(ex: Executor, formId: string): Promise<DocumentKind[]> {
  const rows = await ex
    .select({ kind: affiliationDocument.kind })
    .from(affiliationDocument)
    .where(eq(affiliationDocument.formId, formId))
    .groupBy(affiliationDocument.kind);
  const present = new Set(rows.map((row) => row.kind));
  return (["RG", "PAYSLIP"] as const).filter((kind) => !present.has(kind));
}

/**
 * Abre um documento (só a equipe). A abertura do arquivo inteiro (ou da 1ª
 * página no visualizador) fica na auditoria; a miniatura da lista e da ficha não.
 * PDF: `thumbnail` é a 1ª página pequena (guardada depois da primeira vez);
 * `page` desenha uma página grande para o visualizador.
 */
export async function readDocument(actor: Actor, id: string, options: { thumbnail?: boolean; page?: number } = {}) {
  // "Fichas: só ver" inclui ver os documentos (cada abertura fica na auditoria).
  assertPermission(actor, "viewForms");
  const [row] = await db
    .select({
      id: affiliationDocument.id,
      formId: affiliationDocument.formId,
      kind: affiliationDocument.kind,
      contentType: affiliationDocument.contentType,
      data: affiliationDocument.data,
      preview: affiliationDocument.preview,
      pageCount: affiliationDocument.pageCount,
      fullName: affiliationForm.fullName,
    })
    .from(affiliationDocument)
    .leftJoin(affiliationForm, eq(affiliationForm.id, affiliationDocument.formId))
    .where(eq(affiliationDocument.id, id))
    .limit(1);
  // Envio ainda sem ficha só é visto por quem enviou (no próprio aparelho).
  if (!row || !row.formId) throw new DomainError("NOT_FOUND", "Documento não encontrado.");
  const bytes = decryptBytes(row.data, aadFor(row.id));
  const baseName = `${DOCUMENT_KIND_LABEL[row.kind].toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${row.id.slice(0, 8)}`;
  const isPdf = row.contentType === "application/pdf";
  if (options.thumbnail && isPdf) {
    if (row.preview) {
      return { bytes: decryptBytes(row.preview, previewAadFor(row.id)), contentType: "image/jpeg", fileName: `${baseName}-mini.jpg`, pages: row.pageCount };
    }
    // Enviado antes das prévias existirem: gera agora e guarda para as próximas vezes.
    const preview = await pdfPreview(bytes);
    if (!preview) throw new DomainError("NOT_FOUND", "Sem prévia para este PDF.");
    await db
      .update(affiliationDocument)
      .set({ preview: encryptBytes(preview.jpeg, previewAadFor(row.id)), pageCount: preview.pages })
      .where(eq(affiliationDocument.id, row.id));
    return { bytes: preview.jpeg, contentType: "image/jpeg", fileName: `${baseName}-mini.jpg`, pages: preview.pages };
  }
  if (options.page && isPdf) {
    let rendered: { jpeg: Buffer; pages: number };
    try {
      rendered = await renderPdfPage(bytes, options.page, PAGE_WIDTH);
    } catch (error) {
      if (error instanceof PdfPreviewError) throw new DomainError("NOT_FOUND", "Página não encontrada neste PDF.");
      throw error;
    }
    if (options.page === 1) {
      await withTx((tx) =>
        writeAudit(tx, actor, {
          action: "DOCUMENT_VIEWED",
          entityType: "affiliation_form",
          entityId: row.formId,
          summary: `${DOCUMENT_KIND_LABEL[row.kind]} da ficha de ${row.fullName ?? "filiação"} aberto no visualizador.`,
          after: { documentId: row.id },
        }),
      );
    }
    return { bytes: rendered.jpeg, contentType: "image/jpeg", fileName: `${baseName}-p${options.page}.jpg`, pages: rendered.pages };
  }
  if (options.thumbnail) {
    const { default: sharp } = await import("sharp");
    const thumb = await sharp(bytes).resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
    return { bytes: thumb, contentType: "image/jpeg", fileName: `${baseName}-mini.jpg`, pages: null };
  }
  await withTx((tx) =>
    writeAudit(tx, actor, {
      action: "DOCUMENT_VIEWED",
      entityType: "affiliation_form",
      entityId: row.formId,
      summary: `${DOCUMENT_KIND_LABEL[row.kind]} da ficha de ${row.fullName ?? "filiação"} aberto.`,
      after: { documentId: row.id },
    }),
  );
  const extension = isPdf ? "pdf" : "jpg";
  return { bytes, contentType: row.contentType, fileName: `${baseName}.${extension}`, pages: row.pageCount };
}

/**
 * Apaga um documento. Na ficha em aberto, o Atendimento pode trocar a foto;
 * depois da assinatura, só o administrador apaga (ex.: pedido da pessoa).
 */
export async function removeDocument(actor: Actor, id: string) {
  assertPermission(actor, "newAffiliation");
  return withTx(async (tx) => {
    const [row] = await tx
      .select({ id: affiliationDocument.id, formId: affiliationDocument.formId, kind: affiliationDocument.kind })
      .from(affiliationDocument)
      .where(eq(affiliationDocument.id, id))
      .for("update");
    if (!row || !row.formId) throw new DomainError("NOT_FOUND", "Documento não encontrado.");
    const [form] = await tx
      .select({ status: affiliationForm.status, fullName: affiliationForm.fullName })
      .from(affiliationForm)
      .where(eq(affiliationForm.id, row.formId));
    if (form && form.status !== "DRAFT" && !can(actor.access, "adminCorrections")) {
      throw new DomainError("FORBIDDEN", "Depois da assinatura, só o administrador apaga documentos.");
    }
    await tx.delete(affiliationDocument).where(eq(affiliationDocument.id, row.id));
    await writeAudit(tx, actor, {
      action: "DOCUMENT_REMOVED",
      entityType: "affiliation_form",
      entityId: row.formId,
      summary: `${DOCUMENT_KIND_LABEL[row.kind]} apagado da ficha de ${form?.fullName ?? "filiação"}.`,
      before: { documentId: row.id, kind: row.kind },
    });
    return { formId: row.formId };
  });
}
