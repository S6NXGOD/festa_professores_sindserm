/**
 * Ícone do site: padrão é o emblema da festa; o administrador troca em
 * Configurações (quadrado de 512 px, sem SVG) e volta ao emblema quando quiser.
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/icone/route";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import type { StaffActor } from "@/server/services/actor";
import { DomainError } from "@/server/services/errors";
import { getSiteIconInfo, removeSiteIcon, renderSiteIcon, saveSiteIcon } from "@/server/services/site-icon";
import { configureEvent, createStaff, resetDatabase } from "../helpers/factories";

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
}

/** Cor do pixel (x, y) de um PNG. */
async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

const rectangle = () => sharp({ create: { width: 800, height: 400, channels: 3, background: "#e3000f" } }).png().toBuffer();

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sérgio Segurança");
  await configureEvent(admin);
});

describe("ícone padrão", () => {
  it("sem troca, vale o emblema da festa em quadrado, em todos os tamanhos", async () => {
    const info = await getSiteIconInfo(db);
    expect(info.custom).toBe(false);
    for (const size of [32, 180, 512] as const) {
      const icon = await renderSiteIcon(db, size);
      expect(icon.version).toBe(info.version);
      const meta = await sharp(icon.png).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["png", size, size]);
    }
    // O emblema não é quadrado: sobra a faixa de cima no preto do site.
    expect(await pixel((await renderSiteIcon(db, 512)).png, 256, 4)).toEqual([8, 8, 8]);
  });
});

describe("troca do ícone", () => {
  it("imagem retangular entra inteira, centralizada; a versão muda e fica na auditoria", async () => {
    const before = await getSiteIconInfo(db);
    const saved = await saveSiteIcon(admin, { bytes: await rectangle(), type: "image/png" });
    expect(saved.square).toBe(false);
    expect(saved.version).not.toBe(before.version);
    expect(await getSiteIconInfo(db)).toEqual({ version: saved.version, custom: true });

    const icon = await renderSiteIcon(db, 192);
    expect(icon.version).toBe(saved.version);
    const meta = await sharp(icon.png).metadata();
    expect([meta.width, meta.height]).toEqual([192, 192]);
    // 800×400 vira 192×96 no meio: vermelho no centro, preto do site em cima.
    const [r, g, b] = await pixel(icon.png, 96, 96);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(40);
    expect(await pixel(icon.png, 96, 10)).toEqual([8, 8, 8]);

    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "SITE_ICON_UPDATED"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.summary).toContain("800×400");

    // Mesma imagem, mesma versão: o navegador aproveita o que já baixou.
    expect((await saveSiteIcon(admin, { bytes: await rectangle(), type: "image/png" })).version).toBe(saved.version);
  });

  it("recusa SVG, arquivo que não é imagem e quem não pode mexer nas configurações; volta ao emblema", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>');
    await expectDomainError(saveSiteIcon(admin, { bytes: svg, type: "image/svg+xml" }), "VALIDATION");
    // SVG disfarçado de PNG também para: o formato é conferido no conteúdo.
    await expectDomainError(saveSiteIcon(admin, { bytes: svg, type: "image/png" }), "VALIDATION");
    await expectDomainError(saveSiteIcon(admin, { bytes: Buffer.from("não é imagem"), type: "image/jpeg" }), "VALIDATION");
    await expectDomainError(saveSiteIcon(attendant, { bytes: await rectangle(), type: "image/png" }), "FORBIDDEN");
    await expectDomainError(saveSiteIcon(security, { bytes: await rectangle(), type: "image/png" }), "FORBIDDEN");
    expect((await getSiteIconInfo(db)).custom).toBe(false);

    const standard = await getSiteIconInfo(db);
    await saveSiteIcon(admin, { bytes: await rectangle(), type: "image/png" });
    await expectDomainError(removeSiteIcon(attendant), "FORBIDDEN");
    await removeSiteIcon(admin);
    expect(await getSiteIconInfo(db)).toEqual(standard);
    await removeSiteIcon(admin);
    const removals = await db.select().from(auditLog).where(eq(auditLog.action, "SITE_ICON_REMOVED"));
    expect(removals).toHaveLength(1);
  });
});

describe("rota /icone", () => {
  it("serve PNG no tamanho pedido; guarda de vez só na versão atual", async () => {
    const { version } = await getSiteIconInfo(db);
    const current = await GET(new Request(`http://localhost/icone?s=180&v=${version}`));
    expect(current.status).toBe(200);
    expect(current.headers.get("content-type")).toBe("image/png");
    expect(current.headers.get("cache-control")).toContain("immutable");
    expect((await sharp(Buffer.from(await current.arrayBuffer())).metadata()).width).toBe(180);

    // Versão antiga ou sem versão (ex.: /favicon.ico): cache curto; tamanho fora da lista vai para o próximo.
    const stale = await GET(new Request("http://localhost/icone?s=20&v=antiga"));
    expect(stale.headers.get("cache-control")).toBe("public, max-age=300");
    expect((await sharp(Buffer.from(await stale.arrayBuffer())).metadata()).width).toBe(32);

    // /favicon.ico chega com o endereço original (sem ?s=): tamanho de favicon, não o de 192.
    const favicon = await GET(new Request("http://localhost/favicon.ico"));
    expect((await sharp(Buffer.from(await favicon.arrayBuffer())).metadata()).width).toBe(48);
  });
});
