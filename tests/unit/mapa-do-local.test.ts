import { describe, expect, it } from "vitest";
import { venueSettingsSchema } from "@/domain/schemas";
import { mapsCoordinates, mapsEmbedUrl, mapsOpenUrl, normalizeMapsInput } from "@/lib/maps";

const PLACE =
  "https://www.google.com/maps/place/Clube/@-5.0800,-42.8000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-5.0892!4d-42.8016";
const EMBED = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3974!2d-42.80!3d-5.08";

describe("link do Google Maps", () => {
  it("aceita link de compartilhar, link de lugar e código de incorporar; recusa o resto", () => {
    expect(normalizeMapsInput("")).toEqual({ ok: true, url: null });
    expect(normalizeMapsInput("https://maps.app.goo.gl/AbC123xyz")).toEqual({ ok: true, url: "https://maps.app.goo.gl/AbC123xyz" });
    expect(normalizeMapsInput(PLACE).ok).toBe(true);
    const iframe = `<iframe src="${EMBED.replace(/&/g, "&amp;")}" width="600" height="450" style="border:0;" loading="lazy"></iframe>`;
    expect(normalizeMapsInput(iframe)).toEqual({ ok: true, url: EMBED });
    expect(normalizeMapsInput("https://exemplo.com/maps/place/x").ok).toBe(false);
    expect(normalizeMapsInput("http://www.google.com/maps/place/x").ok).toBe(false);
    expect(normalizeMapsInput("https://www.google.com/search?q=clube").ok).toBe(false);
    expect(normalizeMapsInput("javascript:alert(1)").ok).toBe(false);
  });

  it("usa o pino do lugar (e não o centro da tela) no mapa embutido", () => {
    expect(mapsCoordinates(PLACE)).toEqual({ lat: "-5.0892", lng: "-42.8016" });
    expect(mapsEmbedUrl({ name: null, address: null, mapsUrl: PLACE })).toContain("q=-5.0892%2C-42.8016");
    expect(mapsEmbedUrl({ name: "Clube", address: null, mapsUrl: EMBED })).toBe(EMBED);
  });

  it("sem coordenadas, localiza pelo nome e endereço; sem nada, não mostra mapa", () => {
    const venue = { name: "Clube dos Servidores", address: "Av. Frei Serafim, 2280", mapsUrl: "https://maps.app.goo.gl/AbC123xyz" };
    expect(mapsEmbedUrl(venue)).toContain(encodeURIComponent("Clube dos Servidores, Av. Frei Serafim, 2280"));
    expect(mapsOpenUrl(venue)).toBe("https://maps.app.goo.gl/AbC123xyz");
    expect(mapsOpenUrl({ ...venue, mapsUrl: null })).toContain("google.com/maps/search/?api=1&query=");
    expect(mapsEmbedUrl({ name: null, address: null, mapsUrl: null })).toBeNull();
    expect(mapsOpenUrl({ name: null, address: null, mapsUrl: null })).toBeNull();
  });

  it("descrição do local mantém as quebras de linha (no máximo uma linha em branco)", () => {
    const data = venueSettingsSchema.parse({
      venueName: "  Clube   dos Servidores ",
      venueAddress: "",
      venueDescription: "Estacionamento  gratuito.\r\n\r\n\r\n\r\nEntrada pela lateral.  ",
      venueMapsUrl: "",
    });
    expect(data.venueName).toBe("Clube dos Servidores");
    expect(data.venueAddress).toBeNull();
    expect(data.venueDescription).toBe("Estacionamento gratuito.\n\nEntrada pela lateral.");
    expect(data.venueMapsUrl).toBeNull();
  });
});
