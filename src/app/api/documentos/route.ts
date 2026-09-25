import { revalidatePath } from "next/cache";
import { DOCUMENT_KINDS, type DocumentKind } from "@/domain/types";
import { getConfig } from "@/server/queries/config";
import { errorResponse, isSameOrigin } from "@/server/request";
import { PUBLIC_ACTOR } from "@/server/services/actor";
import { DOCUMENT_MAX_BYTES, storeDocument } from "@/server/services/documents";
import { DomainError } from "@/server/services/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { registrationWindow } from "@/server/services/settings";
import { clientIp, getActor } from "@/server/session";

/*
 * Envio da cópia do RG e do contracheque (ficha de filiação). Rota própria,
 * fora das Server Actions: o celular mostra o progresso de cada arquivo e um
 * envio lento não trava o resto da tela. Pelo site, o arquivo fica pendente
 * até a ficha ser gravada; pelo Atendimento (com `formId`), entra direto na ficha.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Envio não permitido." }, { status: 403 });
  try {
    const actor = (await getActor()) ?? PUBLIC_ACTOR;
    if (actor.kind === "public") {
      await enforceRateLimit(RATE_LIMITS.documentUpload, await clientIp());
      if (registrationWindow(await getConfig()).state !== "OPEN") {
        throw new DomainError("VALIDATION", "As inscrições não estão abertas no momento.");
      }
    }
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > DOCUMENT_MAX_BYTES + 64 * 1024) throw new DomainError("VALIDATION", "Arquivo grande demais (máximo 10 MB).");
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "") as DocumentKind;
    const formId = String(form.get("formId") ?? "");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("VALIDATION", "Escolha uma foto ou um PDF.");
    if (!DOCUMENT_KINDS.includes(kind)) throw new DomainError("VALIDATION", "Tipo de documento inválido.");
    if (formId && !UUID.test(formId)) throw new DomainError("NOT_FOUND", "Ficha não encontrada.");
    const document = await storeDocument(actor, {
      kind,
      bytes: Buffer.from(await file.arrayBuffer()),
      type: file.type,
      formId: formId || null,
    });
    if (formId) {
      revalidatePath("/painel", "layout");
      revalidatePath("/portaria", "layout");
    }
    return Response.json({
      ok: true,
      document: { id: document.id, kind: document.kind, contentType: document.contentType, sizeBytes: document.sizeBytes },
    });
  } catch (error) {
    return errorResponse(error, "Documento da ficha", "Não foi possível enviar o arquivo. Tente de novo.");
  }
}
