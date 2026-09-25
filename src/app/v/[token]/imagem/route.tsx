import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { formatPhone } from "@/lib/phone";
import { getEventInfo } from "@/server/queries/config";
import { loadVoucherByToken, qrPngDataUrl } from "@/server/queries/vouchers";
import { consumeRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { clientIp } from "@/server/session";

const fontsDir = join(process.cwd(), "src/assets/fonts");
const assetsPromise = Promise.all([
  readFile(join(fontsDir, "saira-latin-500-normal.woff")),
  readFile(join(fontsDir, "saira-latin-700-normal.woff")),
  readFile(join(fontsDir, "saira-condensed-latin-900-normal.woff")),
  readFile(join(fontsDir, "tiny5-latin-400-normal.woff")),
  readFile(join(process.cwd(), "public/brand/festa-emblema.jpg")),
  readFile(join(process.cwd(), "public/brand/sindserm-branca.png")),
]);

const WIDTH = 1080;
const HEIGHT = 1920; // 9:16, formato de story/status
const RED = "#ff2626";
const AMBER = "#f8c000";
const INK = "#080808";

/** Imagem PNG do voucher (para salvar na galeria ou compartilhar). */
export async function GET(_request: Request, context: RouteContext<"/v/[token]/imagem">) {
  const { token } = await context.params;
  const limit = await consumeRateLimit(RATE_LIMITS.voucherView, await clientIp());
  if (!limit.allowed) return new Response("Muitas tentativas", { status: 429 });

  const [event, result] = await Promise.all([getEventInfo(), loadVoucherByToken(token)]);
  if (!event || result.status !== "ACTIVE") return new Response("Voucher indisponível", { status: 404 });
  const card = result.card;

  const [regular, bold, condensed, pixel, emblem, unionLogo] = await assetsPromise;
  const qr = await qrPngDataUrl(token, 600);
  const emblemSrc = `data:image/jpeg;base64,${emblem.toString("base64")}`;
  const unionLogoSrc = `data:image/png;base64,${unionLogo.toString("base64")}`;
  const isMember = card.kind === "MEMBER";
  // Funcionário(a) do SINDSERM: "passe da casa" dourado, para não confundir com o voucher dos filiados.
  const isEmployee = card.kind === "EMPLOYEE";
  const accent = isEmployee ? AMBER : RED;
  const kitLine = isEmployee
    ? card.guestName
      ? `2 kits de consumação: o seu e o de ${card.guestName}`
      : "1 kit de consumação"
    : isMember
      ? card.isTeacher
        ? card.guestName
          ? `2 kits de consumação: o seu e o de ${card.guestName}`
          : "1 kit de consumação"
        : "Participação sem kit de consumação"
      : `1 kit de consumação, depois que ${card.hostName ?? "quem te convidou"} chegar`;
  const tag = isEmployee ? "FUNCIONÁRIO(A)" : isMember ? "PLAYER 1" : "PLAYER 2";
  const subtitle = isEmployee
    ? `Funcionário(a) do SINDSERM${card.jobTitle ? ` · ${card.jobTitle}` : ""}`
    : isMember
      ? card.isTeacher
        ? "Professor(a) filiado(a)"
        : "Filiado(a) ao SINDSERM"
      : `Convidado(a) de ${card.hostName ?? ""}`;
  // Nomes longos em fonte menor para caber em até duas linhas.
  const nameSize = card.fullName.length > 34 ? 66 : card.fullName.length > 22 ? 80 : 96;
  const statusLine =
    card.affiliationStatus === "PENDING"
      ? "Aguardando o SINDSERM confirmar a filiação"
      : card.affiliationStatus === "AWAITING_SIGNATURE"
        ? "Sua ficha estará na recepção para assinar"
        : null;

  return new ImageResponse(
    (
      <div style={{ width: WIDTH, height: HEIGHT, display: "flex", background: INK, padding: 44, fontFamily: "Saira" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: "#0e0e0f",
            border: `6px solid ${accent}`,
            borderRadius: 48,
            overflow: "hidden",
            boxShadow: isEmployee ? "0 0 80px rgba(248,192,0,0.4)" : "0 0 80px rgba(255,38,38,0.45)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", background: INK, paddingTop: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori */}
            <img src={emblemSrc} width={560} height={481} alt="" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", padding: "8px 64px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  fontFamily: "Pixel",
                  fontSize: 36,
                  padding: "14px 18px",
                  borderRadius: 8,
                  background: isEmployee ? AMBER : isMember ? "#e3000f" : "#232326",
                  color: isEmployee ? "#1a1300" : "#ffffff",
                }}
              >
                {tag}
              </div>
              <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 28, letterSpacing: 2, color: isEmployee ? AMBER : "#a8a49e" }}>
                {isEmployee ? "PASSE DA CASA" : "ADMIT ONE"}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 28,
                fontFamily: "SairaCondensed",
                fontSize: nameSize,
                fontWeight: 900,
                lineHeight: 0.95,
                color: "#f5f4f1",
                textTransform: "uppercase",
              }}
            >
              {card.fullName}
            </div>
            <div style={{ display: "flex", marginTop: 14, fontSize: 36, fontWeight: 500, color: isEmployee ? AMBER : "#a8a49e" }}>
              {subtitle}
            </div>
          </div>

          <div style={{ display: "flex", margin: "32px 48px 0", borderTop: "5px dashed #3b3b41" }} />

          <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center", padding: "20px 64px 12px" }}>
            <div
              style={{
                display: "flex",
                padding: 18,
                background: "#ffffff",
                borderRadius: 28,
                boxShadow: isEmployee ? "0 0 0 10px rgba(248,192,0,0.3)" : "0 0 0 10px rgba(255,38,38,0.28)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori */}
              <img src={qr} width={400} height={400} alt="" />
            </div>
            <div style={{ display: "flex", marginTop: 34, fontSize: 60, fontWeight: 700, letterSpacing: 12, color: "#f5f4f1" }}>
              {card.code}
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 32, fontWeight: 700, color: "#a8a49e" }}>
              {`${event.dateLabel} · ${event.timeLabel}`}
            </div>
            {event.venue?.name ? (
              <div style={{ display: "flex", marginTop: 6, fontSize: 28, fontWeight: 500, color: "#a8a49e", textAlign: "center" }}>
                {event.venue.name}
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                marginTop: 30,
                padding: "20px 28px",
                borderRadius: 20,
                border: isEmployee ? "3px solid rgba(248,192,0,0.6)" : "3px solid rgba(255,38,38,0.55)",
                background: isEmployee ? "rgba(248,192,0,0.12)" : "rgba(255,38,38,0.12)",
                fontSize: 30,
                fontWeight: 700,
                color: "#f5f4f1",
                textAlign: "center",
              }}
            >
              {kitLine}
            </div>
            {statusLine ? (
              <div style={{ display: "flex", marginTop: 16, fontSize: 28, fontWeight: 700, color: "#f8c000" }}>{statusLine}</div>
            ) : null}
          </div>

          {/* Rodapé do ingresso: a assinatura do organizador, centralizada. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              margin: "0 48px",
              padding: "18px 0 24px",
              borderTop: "2px solid #26262a",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori */}
            <img src={unionLogoSrc} width={308} height={88} alt="" />
            {event.helpWhatsapp ? (
              <div style={{ display: "flex", marginTop: 12, fontSize: 26, fontWeight: 700, color: "#a8a49e" }}>
                {`Dúvidas? WhatsApp ${formatPhone(event.helpWhatsapp)}`}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Saira", data: regular, weight: 500, style: "normal" },
        { name: "Saira", data: bold, weight: 700, style: "normal" },
        { name: "SairaCondensed", data: condensed, weight: 900, style: "normal" },
        { name: "Pixel", data: pixel, weight: 400, style: "normal" },
      ],
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
