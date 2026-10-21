import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { APP_NAME, getEventInfo, getRegistrationWindow } from "@/server/queries/config";
import { registrationLine } from "@/server/queries/share";
import { capitalizeFirst, splitEventName } from "@/lib/text";
import { EDITION } from "@/domain/edition";

/*
 * Prévia do link (WhatsApp, Instagram, Facebook): arte da festa + nome, data,
 * local e prazo das inscrições, sempre com os dados do painel. Sai em JPEG
 * (o WhatsApp ignora prévias pesadas).
 */

export const alt = "Convite da festa: arte, data, local e inscrições";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

// Cores e fontes da festa desta edição: vermelho e preto, letreiro pixel (anos 80) ou coral e azul do fim de tarde, letras redondas (verão).
const SUMMER = EDITION.theme === "verao";
const fontsDir = join(process.cwd(), "src/assets/fonts");
const assetsPromise = Promise.all([
  readFile(join(fontsDir, "saira-latin-500-normal.woff")),
  readFile(join(fontsDir, "saira-latin-700-normal.woff")),
  readFile(join(fontsDir, SUMMER ? "lilita-one-latin-400-normal.woff" : "saira-condensed-latin-900-normal.woff")),
  readFile(join(fontsDir, SUMMER ? "fredoka-latin-600-normal.woff" : "tiny5-latin-400-normal.woff")),
  readFile(join(process.cwd(), "public", EDITION.emblem.raster)),
  readFile(join(process.cwd(), "public/brand/sindserm-branca.png")),
]);
const EMBLEM_MIME = EDITION.emblem.raster.endsWith(".png") ? "image/png" : "image/jpeg";

const RED = SUMMER ? "#ff6a4d" : "#ff2626";
const INK = SUMMER ? "#0a1630" : "#080808";
const SKY = SUMMER
  ? `radial-gradient(circle at 25% 110%, rgba(255,140,80,0.45), transparent 55%), linear-gradient(180deg, ${INK} 0%, #3a1d4f 100%)`
  : `radial-gradient(circle at 25% 110%, rgba(255,38,38,0.35), transparent 55%), linear-gradient(180deg, ${INK} 0%, #120304 100%)`;

export default async function OpenGraphImage() {
  const [event, window] = await Promise.all([getEventInfo(), getRegistrationWindow()]);
  const [regular, bold, condensed, pixel, emblem, unionLogo] = await assetsPromise;
  // "Festa ... – SINDSERMTHE 2026": a parte depois do travessão vai para a chamada em vermelho.
  const { title: name, tagline } = splitEventName(event?.name ?? APP_NAME);
  const when = event ? `${capitalizeFirst(event.dateLongLabel.replace(/ de \d{4}$/, ""))} · ${event.timeLabel}` : null;
  const where = event?.venue?.name ?? null;
  const status = registrationLine(window);
  const open = window.state === "OPEN";
  // Nomes longos em fonte menor: até três linhas cabem ao lado da arte.
  // A Lilita One (verão) é mais larga que a Saira Condensed.
  const nameSize = Math.round((name.length > 44 ? 58 : name.length > 30 ? 68 : 80) * (SUMMER ? 0.86 : 1));

  const png = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: INK,
          backgroundImage: SKY,
          fontFamily: "Saira",
          color: "#f5f4f1",
          position: "relative",
        }}
      >
        {SUMMER ? (
          /* Ondas do mar no pé da imagem (verão) */
          <svg width="1200" height="130" viewBox="0 0 1200 130" style={{ position: "absolute", left: 0, bottom: 0 }}>
            <path d="M0 40 Q 150 0 300 40 T 600 40 T 900 40 T 1200 40 V130 H0 Z" fill="rgba(31,214,201,0.32)" />
            <path d="M0 72 Q 150 34 300 72 T 600 72 T 900 72 T 1200 72 V130 H0 Z" fill="rgba(46,120,255,0.34)" />
            <path d="M0 102 Q 150 70 300 102 T 600 102 T 900 102 T 1200 102 V130 H0 Z" fill="rgba(10,22,48,0.92)" />
          </svg>
        ) : (
          /* Chão de neon (grade dos anos 80) */
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 150,
              display: "flex",
              backgroundImage: "linear-gradient(rgba(255,38,38,0.55) 2px, transparent 2px), linear-gradient(90deg, rgba(255,38,38,0.35) 2px, transparent 2px)",
              backgroundSize: "60px 30px",
              opacity: 0.35,
            }}
          />
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 560, padding: "0 10px 0 40px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori */}
          <img src={`data:${EMBLEM_MIME};base64,${emblem.toString("base64")}`} width={510} height={437} alt="" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "40px 56px 40px 20px" }}>
          <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 26, color: RED, letterSpacing: 2, textTransform: "uppercase" }}>
            {tagline ?? "SINDSERM apresenta"}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 14,
              fontFamily: "SairaCondensed",
              fontWeight: 900,
              fontSize: nameSize,
              lineHeight: SUMMER ? 1.02 : 0.95,
              textTransform: "uppercase",
              textShadow: `0 4px 0 ${SUMMER ? "#b8341a" : "#b00000"}`,
            }}
          >
            {name}
          </div>
          {/* Com horário de término ("19h às 23h") a linha cresce: fonte menor para não sobrar "23h" sozinho. */}
          {when ? <div style={{ display: "flex", marginTop: 22, fontSize: when.length > 36 ? 29 : 34, fontWeight: 700 }}>{when}</div> : null}
          {where ? <div style={{ display: "flex", marginTop: 6, fontSize: 28, fontWeight: 500, color: SUMMER ? "#c1c6e0" : "#b9b5ae" }}>{where}</div> : null}
          <div style={{ display: "flex", marginTop: 26 }}>
            <div
              style={{
                display: "flex",
                padding: "12px 22px",
                borderRadius: 12,
                background: open ? RED : SUMMER ? "#213567" : "#232326",
                color: "#ffffff",
                fontSize: 28,
                fontWeight: 700,
                boxShadow: open ? `0 6px 0 ${SUMMER ? "#b8341a" : "#8e0000"}` : "none",
              }}
            >
              {status}
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 30 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori */}
            <img src={`data:image/png;base64,${unionLogo.toString("base64")}`} width={210} height={60} alt="" />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Saira", data: regular, weight: 500, style: "normal" },
        { name: "Saira", data: bold, weight: 700, style: "normal" },
        { name: "SairaCondensed", data: condensed, weight: 900, style: "normal" },
        { name: "Pixel", data: pixel, weight: 400, style: "normal" },
      ],
    },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=600" },
  });
}
