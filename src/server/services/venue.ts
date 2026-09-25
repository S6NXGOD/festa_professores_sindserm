import "server-only";
import { eq } from "drizzle-orm";
import type { Executor } from "@/server/db";
import { eventConfig, eventPhoto } from "@/server/db/schema";
import type { VenueSettingsData } from "@/domain/schemas";
import { isShortMapsUrl, normalizeMapsInput } from "@/lib/maps";
import { type Actor, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { DomainError } from "./errors";
import { withTx } from "./tx";

/** Limite do arquivo recebido (o navegador já reduz a foto antes de enviar). */
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_MAX_SIDE = 1600;

/**
 * Link curto do Maps (botão "Compartilhar") não traz coordenadas. Tenta ler o
 * redirecionamento para guardar o link completo, que posiciona o mapa no pino.
 * Sem internet ou sem resposta, fica o link curto (o mapa usa o endereço).
 */
export async function resolveShortMapsUrl(url: string): Promise<string> {
  if (!isShortMapsUrl(url)) return url;
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4000) });
    const location = response.headers.get("location");
    if (!location) return url;
    const resolved = normalizeMapsInput(new URL(location, url).toString());
    return resolved.ok && resolved.url && !isShortMapsUrl(resolved.url) ? resolved.url : url;
  } catch {
    return url;
  }
}

/** Nome, endereço, descrição e link do Google Maps do local da festa. */
export async function updateVenueSettings(actor: Actor, data: VenueSettingsData) {
  assertPermission(actor, "manageSettings");
  const values = {
    venueName: data.venueName,
    venueAddress: data.venueAddress,
    venueDescription: data.venueDescription,
    venueMapsUrl: data.venueMapsUrl ? await resolveShortMapsUrl(data.venueMapsUrl) : null,
  };
  return withTx(async (tx) => {
    const [current] = await tx.select().from(eventConfig).where(eq(eventConfig.id, 1)).for("update");
    if (!current) throw new DomainError("INVALID_STATE", "Conclua a configuração inicial primeiro.");
    await tx.update(eventConfig).set(values).where(eq(eventConfig.id, 1));
    const changed = (Object.keys(values) as (keyof typeof values)[]).filter((key) => current[key] !== values[key]);
    await writeAudit(tx, actor, {
      action: "VENUE_UPDATED",
      entityType: "event",
      entityId: "1",
      summary: `Local da festa atualizado (${changed.join(", ") || "sem mudanças"}).`,
      before: Object.fromEntries(changed.map((key) => [key, current[key]])),
      after: Object.fromEntries(changed.map((key) => [key, values[key]])),
    });
    return values;
  });
}

/**
 * Foto do local: reduzida para no máximo 1600 px, convertida para WEBP e sem
 * metadados (o sharp descarta EXIF/GPS por padrão; `rotate()` aplica a
 * orientação da câmera antes).
 */
export async function saveEventPhoto(actor: Actor, upload: { bytes: Buffer; type: string }) {
  assertPermission(actor, "manageSettings");
  if (!upload.type.startsWith("image/")) {
    throw new DomainError("VALIDATION", "Envie uma imagem (JPG, PNG ou WEBP).");
  }
  if (upload.bytes.length === 0 || upload.bytes.length > PHOTO_MAX_BYTES) {
    throw new DomainError("VALIDATION", "A foto precisa ter até 8 MB.");
  }
  const { default: sharp } = await import("sharp");
  let output: { data: Buffer; info: { width: number; height: number } };
  try {
    output = await sharp(upload.bytes, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: PHOTO_MAX_SIDE, height: PHOTO_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new DomainError("VALIDATION", "Não foi possível ler a imagem. Tente uma foto em JPG ou PNG.");
  }
  const values = {
    data: output.data,
    mimeType: "image/webp",
    width: output.info.width,
    height: output.info.height,
    updatedByUserId: actor.userId,
    updatedAt: new Date(),
  };
  return withTx(async (tx) => {
    await tx
      .insert(eventPhoto)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: eventPhoto.id, set: values });
    await writeAudit(tx, actor, {
      action: "VENUE_PHOTO_UPDATED",
      entityType: "event",
      entityId: "1",
      summary: `Foto do local atualizada (${values.width}×${values.height}).`,
    });
    return { width: values.width, height: values.height };
  });
}

export async function removeEventPhoto(actor: Actor) {
  assertPermission(actor, "manageSettings");
  return withTx(async (tx) => {
    const removed = await tx.delete(eventPhoto).where(eq(eventPhoto.id, 1)).returning({ id: eventPhoto.id });
    if (removed.length) {
      await writeAudit(tx, actor, { action: "VENUE_PHOTO_REMOVED", entityType: "event", entityId: "1", summary: "Foto do local removida." });
    }
  });
}

export async function getEventPhoto(ex: Executor) {
  const [row] = await ex.select().from(eventPhoto).where(eq(eventPhoto.id, 1)).limit(1);
  return row ?? null;
}

/** Só as dimensões e a versão (sem os bytes): usado para montar a URL da foto. */
export async function getEventPhotoMeta(ex: Executor) {
  const [row] = await ex
    .select({ width: eventPhoto.width, height: eventPhoto.height, updatedAt: eventPhoto.updatedAt })
    .from(eventPhoto)
    .where(eq(eventPhoto.id, 1))
    .limit(1);
  return row ?? null;
}
