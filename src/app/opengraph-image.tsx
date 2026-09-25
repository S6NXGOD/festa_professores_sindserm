import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { APP_NAME, getEventInfo, getRegistrationWindow } from "@/server/queries/config";
import { registrationLine } from "@/server/queries/share";
import { capitalizeFirst, splitEventName } from "@/lib/text";

/*
 * Prévia do link (WhatsApp, Instagram, Facebook): arte da festa + nome, data,
 * local e prazo das inscrições, sempre com os dados do painel. Sai em JPEG
 * (o WhatsApp ignora prévias pesadas).
 */

export const alt = "Convite da festa: arte, data, local e inscrições";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

const fontsDir = join(process.cwd(), "src/assets/fonts");
const assetsPromise = Promise.all([
  readFile(join(fontsDir, "saira-latin-500-normal.woff")),
  readFile(join(fontsDir, "saira-latin-700-normal.woff")),
  readFile(join(fontsDir, "saira-condensed-latin-900-normal.woff")),
  readFile(join(fontsDir, "tiny5-latin-400-normal.woff")),
  readFile(join(process.cwd(), "public/brand/festa-emblema.jpg")),
  readFile(join(process.cwd(), "public/brand/sindserm-branca.png")),
]);

const RED = "#ff2626";
const INK = "#080808";

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
  const nameSize = name.length > 44 ? 58 : name.length > 30 ? 68 : 80;

  const png = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: INK,
          backgroundImage: `radial-gradient(circle at 25% 110%, rgba(255,38,38,0.35), transparent 55%), linear-gradient(180deg, ${INK} 0%, #120304 100%)`,
          fontFamily: "Saira",
          color: "#f5f4f1",
          position: "relative",
        }}
      >
        {/* Chão de neon (grade dos anos 80) */}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 560, padding: "0 10px 0 40px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori */}
          <img src={`data:image/jpeg;base64,${emblem.toString("base64")}`} width={510} height={437} alt="" />
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
              lineHeight: 0.95,
              textTransform: "uppercase",
              textShadow: `0 4px 0 #b00000`,
            }}
          >
            {name}
          </div>
          {/* Com horário de término ("19h às 23h") a linha cresce: fonte menor para não sobrar "23h" sozinho. */}
          {when ? <div style={{ display: "flex", marginTop: 22, fontSize: when.length > 36 ? 29 : 34, fontWeight: 700 }}>{when}</div> : null}
          {where ? <div style={{ display: "flex", marginTop: 6, fontSize: 28, fontWeight: 500, color: "#b9b5ae" }}>{where}</div> : null}
          <div style={{ display: "flex", marginTop: 26 }}>
            <div
              style={{
                display: "flex",
                padding: "12px 22px",
                borderRadius: 12,
                background: open ? RED : "#232326",
                color: "#ffffff",
                fontSize: 28,
                fontWeight: 700,
                boxShadow: open ? "0 6px 0 #8e0000" : "none",
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
