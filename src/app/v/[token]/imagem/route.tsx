import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { employeeTitleLine } from "@/domain/labels";
import type { EmployeeCategory } from "@/domain/types";
import { formatPhone } from "@/lib/phone";
import { firstName, properName } from "@/lib/text";
import { KIT_BOX, LINE_HEIGHT, NAME_LINE_HEIGHT, VOUCHER_IMAGE, voucherImageLayout } from "@/lib/voucher-image-layout";
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

const { width: WIDTH, height: HEIGHT } = VOUCHER_IMAGE;
const RED = "#ff2626";
const AMBER = "#f8c000";

/** O "metal" do passe da casa por categoria (o mesmo do voucher na tela). */
const METAL: Record<EmployeeCategory, { accent: string; rgb: string; tagText: string; tag: string }> = {
  BOARD: { accent: "#e4e4e7", rgb: "228,228,231", tagText: "#0e0e0f", tag: "DIRETORIA" },
  STAFF: { accent: AMBER, rgb: "248,192,0", tagText: "#1a1300", tag: "FUNCIONÁRIO(A)" },
  CONTRACTOR: { accent: "#22d3ee", rgb: "34,211,238", tagText: "#0e0e0f", tag: "PRESTADOR(A)" },
  COURTESY: { accent: "#ff4fb4", rgb: "255,79,180", tagText: "#1a0010", tag: "CORTESIA" },
};
const INK = "#080808";
/** Nenhum bloco encolhe: a altura de cada um é garantida pela conta do layout. */
const KEEP = { flexShrink: 0 } as const;

/** Imagem PNG do voucher (para salvar na galeria ou compartilhar). */
export async function GET(_request: Request, context: RouteContext<"/v/[token]/imagem">) {
  const { token } = await context.params;
  const limit = await consumeRateLimit(RATE_LIMITS.voucherView, await clientIp());
  if (!limit.allowed) return new Response("Muitas tentativas", { status: 429 });

  const [event, result] = await Promise.all([getEventInfo(), loadVoucherByToken(token)]);
  if (!event || result.status !== "ACTIVE") return new Response("Voucher indisponível", { status: 404 });
  const card = result.card;

  const [regular, bold, condensed, pixel, emblem, unionLogo] = await assetsPromise;
  const emblemSrc = `data:image/jpeg;base64,${emblem.toString("base64")}`;
  const unionLogoSrc = `data:image/png;base64,${unionLogo.toString("base64")}`;
  const isMember = card.kind === "MEMBER";
  // Colaborador(a) do SINDSERM: "passe da casa" no metal da categoria, para não confundir com o voucher dos filiados.
  const isEmployee = card.kind === "EMPLOYEE";
  const category: EmployeeCategory = card.category ?? "STAFF";
  const metal = METAL[category];
  const accent = isEmployee ? metal.accent : RED;
  const glowRgb = isEmployee ? metal.rgb : "255,38,38";
  // Na faixa do kit, só o primeiro nome: o nome completo já está no voucher de cada pessoa.
  const guestFirst = card.guestName ? firstName(card.guestName) : null;
  const kitLine = isEmployee
    ? guestFirst
      ? `2 kits de consumação: o seu e o de ${guestFirst}`
      : "1 kit de consumação"
    : isMember
      ? card.isTeacher
        ? guestFirst
          ? `2 kits de consumação: o seu e o de ${guestFirst}`
          : "1 kit de consumação"
        : "Participação sem kit de consumação"
      : `1 kit de consumação, depois que ${card.hostName ? firstName(card.hostName) : "quem te convidou"} chegar`;
  const tag = isEmployee ? metal.tag : isMember ? "PLAYER 1" : "PLAYER 2";
  const subtitle = isEmployee
    ? employeeTitleLine(category, card.jobTitle)
    : isMember
      ? card.isTeacher
        ? "Professor(a) filiado(a)"
        : "Filiado(a) ao SINDSERM"
      : `Convidado(a) de ${card.hostName ? properName(card.hostName) : ""}`;
  const statusLine =
    card.affiliationStatus === "PENDING"
      ? "Aguardando o SINDSERM confirmar a filiação"
      : card.affiliationStatus === "AWAITING_SIGNATURE"
        ? "Sua ficha estará na recepção para assinar"
        : null;
  const layout = voucherImageLayout({
    fullName: card.fullName,
    subtitle,
    kitLine,
    statusLine,
    venue: event.venue?.name ?? null,
    hasHelp: Boolean(event.helpWhatsapp),
  });
  const qr = await qrPngDataUrl(token, 600);

  return new ImageResponse(
    (
      <div style={{ width: WIDTH, height: HEIGHT, display: "flex", background: INK, padding: VOUCHER_IMAGE.pagePadding, fontFamily: "Saira" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: "#0e0e0f",
            border: `${VOUCHER_IMAGE.border}px solid ${accent}`,
            borderRadius: 48,
            overflow: "hidden",
            boxShadow: `0 0 80px rgba(${glowRgb},${isEmployee ? 0.4 : 0.45})`,
          }}
        >
          <div style={{ ...KEEP, display: "flex", justifyContent: "center", background: INK, paddingTop: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori */}
            <img src={emblemSrc} width={layout.emblemWidth} height={layout.emblemHeight} alt="" />
          </div>

          <div style={{ ...KEEP, display: "flex", flexDirection: "column", padding: `8px ${VOUCHER_IMAGE.sidePadding}px 0` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  fontFamily: "Pixel",
                  fontSize: 36,
                  padding: "14px 18px",
                  borderRadius: 8,
                  background: isEmployee ? metal.accent : isMember ? "#e3000f" : "#232326",
                  color: isEmployee ? metal.tagText : "#ffffff",
                }}
              >
                {tag}
              </div>
              <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 28, letterSpacing: 2, color: isEmployee ? metal.accent : "#a8a49e" }}>
                {isEmployee ? (category === "COURTESY" ? "CONVITE ESPECIAL" : "PASSE DA CASA") : "ADMIT ONE"}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 28,
                fontFamily: "SairaCondensed",
                fontSize: layout.nameSize,
                fontWeight: 900,
                lineHeight: NAME_LINE_HEIGHT,
                color: "#f5f4f1",
                textTransform: "uppercase",
              }}
            >
              {card.fullName}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 14,
                fontSize: 36,
                lineHeight: LINE_HEIGHT,
                fontWeight: 500,
                color: isEmployee ? metal.accent : "#a8a49e",
              }}
            >
              {subtitle}
            </div>
          </div>

          <div style={{ ...KEEP, display: "flex", margin: "32px 48px 0", borderTop: "5px dashed #3b3b41" }} />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: `20px ${VOUCHER_IMAGE.sidePadding}px 12px`,
            }}
          >
            <div
              style={{
                ...KEEP,
                display: "flex",
                padding: 18,
                background: "#ffffff",
                borderRadius: 28,
                boxShadow: `0 0 0 10px rgba(${glowRgb},${isEmployee ? 0.3 : 0.28})`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori */}
              <img src={qr} width={layout.qrSize} height={layout.qrSize} alt="" />
            </div>
            <div style={{ ...KEEP, display: "flex", marginTop: 34, fontSize: 60, lineHeight: 1.1, fontWeight: 700, letterSpacing: 12, color: "#f5f4f1" }}>
              {card.code}
            </div>
            <div style={{ ...KEEP, display: "flex", marginTop: 18, fontSize: 32, lineHeight: LINE_HEIGHT, fontWeight: 700, color: "#a8a49e" }}>
              {`${event.dateLabel} · ${event.timeLabel}`}
            </div>
            {event.venue?.name ? (
              <div
                style={{
                  ...KEEP,
                  display: "flex",
                  marginTop: 6,
                  fontSize: 28,
                  lineHeight: LINE_HEIGHT,
                  fontWeight: 500,
                  color: "#a8a49e",
                  textAlign: "center",
                }}
              >
                {event.venue.name}
              </div>
            ) : null}
            <div
              style={{
                ...KEEP,
                display: "flex",
                justifyContent: "center",
                maxWidth: "100%",
                marginTop: KIT_BOX.marginTop,
                padding: `${KIT_BOX.paddingY}px ${KIT_BOX.paddingX}px`,
                borderRadius: 20,
                border: `${KIT_BOX.border}px solid rgba(${glowRgb},${isEmployee ? 0.6 : 0.55})`,
                background: `rgba(${glowRgb},0.12)`,
                fontSize: KIT_BOX.fontSize,
                lineHeight: LINE_HEIGHT,
                fontWeight: 700,
                color: "#f5f4f1",
                textAlign: "center",
              }}
            >
              {kitLine}
            </div>
            {statusLine ? (
              <div style={{ ...KEEP, display: "flex", marginTop: 16, fontSize: 28, lineHeight: LINE_HEIGHT, fontWeight: 700, color: AMBER, textAlign: "center" }}>
                {statusLine}
              </div>
            ) : null}
          </div>

          {/* Rodapé do ingresso: a assinatura do organizador, centralizada. */}
          <div
            style={{
              ...KEEP,
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
              <div style={{ display: "flex", marginTop: 12, fontSize: 26, lineHeight: LINE_HEIGHT, fontWeight: 700, color: "#a8a49e" }}>
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
