/**
 * Local da festa: dados, link do Maps e foto (reduzida, em WEBP e sem metadados).
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, eventConfig } from "@/server/db/schema";
import { venueSettingsSchema } from "@/domain/schemas";
import type { StaffActor } from "@/server/services/actor";
import { DomainError } from "@/server/services/errors";
import { getEventPhoto, removeEventPhoto, saveEventPhoto, updateVenueSettings } from "@/server/services/venue";
import { configureEvent, createStaff, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;

async function expectDomainError(promise: Promise<unknown>, code: DomainError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `esperava erro ${code}`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}

const venue = venueSettingsSchema.parse({
  venueName: "Clube dos Servidores",
  venueAddress: "Av. Frei Serafim, 2280 — Centro",
  venueDescription: "Estacionamento gratuito.",
  venueMapsUrl: "https://www.google.com/maps/place/Clube/@-5.08,-42.80,17z/data=!3d-5.0892!4d-42.8016",
});

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  await configureEvent(admin);
});

describe("dados do local", () => {
  it("só o administrador altera; tudo fica na auditoria", async () => {
    await expectDomainError(updateVenueSettings(attendant, venue), "FORBIDDEN");
    await updateVenueSettings(admin, venue);
    const [config] = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
    expect(config).toMatchObject({
      venueName: "Clube dos Servidores",
      venueAddress: "Av. Frei Serafim, 2280 — Centro",
      venueDescription: "Estacionamento gratuito.",
      venueMapsUrl: venue.venueMapsUrl,
    });
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "VENUE_UPDATED"));
    expect(audits).toHaveLength(1);
  });
});

describe("foto do local", () => {
  it("reduz para no máximo 1600 px, converte para WEBP e remove os metadados (EXIF/GPS)", async () => {
    const original = await sharp({ create: { width: 3200, height: 2000, channels: 3, background: "#e3000f" } })
      .withExif({ IFD0: { Artist: "Celular do fotógrafo" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const saved = await saveEventPhoto(admin, { bytes: original, type: "image/jpeg" });
    expect(saved).toEqual({ width: 1600, height: 1000 });
    const photo = await getEventPhoto(db);
    expect(photo?.mimeType).toBe("image/webp");
    const meta = await sharp(photo!.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1600);
    expect(meta.exif).toBeUndefined();
  });

  it("recusa arquivo que não é imagem e perfil sem permissão; remove a foto", async () => {
    await expectDomainError(saveEventPhoto(admin, { bytes: Buffer.from("não é imagem"), type: "image/jpeg" }), "VALIDATION");
    await expectDomainError(saveEventPhoto(admin, { bytes: Buffer.from("texto"), type: "text/plain" }), "VALIDATION");
    const small = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#000" } }).png().toBuffer();
    await expectDomainError(saveEventPhoto(attendant, { bytes: small, type: "image/png" }), "FORBIDDEN");

    // Foto pequena não é ampliada.
    expect(await saveEventPhoto(admin, { bytes: small, type: "image/png" })).toEqual({ width: 400, height: 300 });
    await removeEventPhoto(admin);
    expect(await getEventPhoto(db)).toBeNull();
  });
});
