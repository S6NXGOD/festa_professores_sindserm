import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { Executor } from "@/server/db";
import { siteIcon } from "@/server/db/schema";
import type { IconSize } from "@/lib/site-icon";
import { type Actor, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { DomainError } from "./errors";
import { withTx } from "./tx";

/** Limite do arquivo recebido (o navegador já reduz a imagem antes de enviar). */
export const ICON_MAX_BYTES = 8 * 1024 * 1024;
const MASTER_SIDE = 512;
/** Fundo das bordas quando a imagem não é quadrada: o preto do site. */
const BACKGROUND = "#080808";
/** SVG fica de fora: o arquivo pode apontar para outros arquivos ao ser desenhado. */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);
/** Muda quando o jeito de montar o ícone muda, para o navegador buscar de novo. */
const PROCESSING = "q1";

const DEFAULT_SOURCE = join(process.cwd(), "public/brand/festa-emblema.jpg");

/** Quadrado de 512 px em PNG: a imagem inteira, centralizada, com bordas pretas se precisar. */
async function toMaster(bytes: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp(bytes, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize(MASTER_SIDE, MASTER_SIDE, { fit: "contain", background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function versionOf(master: Buffer): string {
  return `${PROCESSING}-${createHash("sha256").update(master).digest("hex").slice(0, 12)}`;
}

let defaultMaster: Promise<{ png: Buffer; version: string }> | null = null;

/** Emblema da festa (padrão enquanto ninguém troca o ícone). Montado uma vez por processo. */
function loadDefaultMaster() {
  defaultMaster ??= readFile(DEFAULT_SOURCE)
    .then(toMaster)
    .then((png) => ({ png, version: versionOf(png) }))
    .catch((error: unknown) => {
      defaultMaster = null;
      throw error;
    });
  return defaultMaster;
}

export async function saveSiteIcon(actor: Actor, upload: { bytes: Buffer; type: string }) {
  assertPermission(actor, "manageSettings");
  if (!upload.type.startsWith("image/") || upload.type.includes("svg")) {
    throw new DomainError("VALIDATION", "Envie uma imagem em JPG, PNG ou WEBP.");
  }
  if (upload.bytes.length === 0 || upload.bytes.length > ICON_MAX_BYTES) {
    throw new DomainError("VALIDATION", "A imagem precisa ter até 8 MB.");
  }
  const { default: sharp } = await import("sharp");
  let master: Buffer;
  let source: { width: number; height: number };
  try {
    const meta = await sharp(upload.bytes, { limitInputPixels: 60_000_000 }).metadata();
    if (!ACCEPTED_FORMATS.has(meta.format)) throw new Error("formato");
    source = meta.autoOrient;
    master = await toMaster(upload.bytes);
  } catch {
    throw new DomainError("VALIDATION", "Não foi possível ler a imagem. Tente um arquivo JPG ou PNG.");
  }
  const version = versionOf(master);
  const values = { data: master, version, updatedByUserId: actor.userId, updatedAt: new Date() };
  return withTx(async (tx) => {
    await tx
      .insert(siteIcon)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: siteIcon.id, set: values });
    const square = source.width === source.height;
    await writeAudit(tx, actor, {
      action: "SITE_ICON_UPDATED",
      entityType: "event",
      entityId: "1",
      summary: `Ícone do site trocado (imagem de ${source.width}×${source.height}${square ? "" : ", centralizada com bordas"}).`,
      after: { version },
    });
    return { version, square };
  });
}

/** Volta ao emblema da festa. */
export async function removeSiteIcon(actor: Actor) {
  assertPermission(actor, "manageSettings");
  return withTx(async (tx) => {
    const removed = await tx.delete(siteIcon).where(eq(siteIcon.id, 1)).returning({ version: siteIcon.version });
    if (removed.length) {
      await writeAudit(tx, actor, {
        action: "SITE_ICON_REMOVED",
        entityType: "event",
        entityId: "1",
        summary: "Ícone do site voltou a ser o emblema da festa.",
        before: { version: removed[0]!.version },
      });
    }
  });
}

/** Ícone atual: o enviado em Configurações ou, sem ele, o emblema da festa. */
export async function getSiteIconInfo(ex: Executor): Promise<{ version: string; custom: boolean }> {
  const [row] = await ex.select({ version: siteIcon.version }).from(siteIcon).where(eq(siteIcon.id, 1)).limit(1);
  if (row) return { version: row.version, custom: true };
  return { version: (await loadDefaultMaster()).version, custom: false };
}

// Tamanhos já montados (poucos: 10 tamanhos por versão). Some quando a versão muda.
const rendered = new Map<string, Buffer>();

async function loadMaster(ex: Executor, custom: boolean): Promise<{ png: Buffer; version: string }> {
  if (custom) {
    const [row] = await ex.select({ png: siteIcon.data, version: siteIcon.version }).from(siteIcon).where(eq(siteIcon.id, 1)).limit(1);
    // Removido entre as duas leituras: vale o emblema.
    if (row) return row;
  }
  return loadDefaultMaster();
}

/** PNG do ícone atual no tamanho pedido (e a versão que ele representa). */
export async function renderSiteIcon(ex: Executor, size: IconSize): Promise<{ version: string; png: Buffer }> {
  const info = await getSiteIconInfo(ex);
  const hit = rendered.get(`${info.version}:${size}`);
  if (hit) return { version: info.version, png: hit };

  const master = await loadMaster(ex, info.custom);
  const { default: sharp } = await import("sharp");
  const png = size === MASTER_SIDE ? master.png : await sharp(master.png).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  if (rendered.size >= 40) rendered.clear();
  rendered.set(`${master.version}:${size}`, png);
  return { version: master.version, png };
}
