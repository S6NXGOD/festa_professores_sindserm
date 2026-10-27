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
import { EDITION, GAME, T } from "@/domain/edition";

const fontsDir = join(process.cwd(), "src/assets/fonts");
const assetsPromise = Promise.all([
  readFile(join(fontsDir, "saira-latin-500-normal.woff")),
  readFile(join(fontsDir, "saira-latin-700-normal.woff")),
  readFile(join(fontsDir, "saira-condensed-latin-900-normal.woff")),
  // Selos do voucher: letreiro pixel (anos 80) ou a condensada forte da logo (verão).
  readFile(join(fontsDir, EDITION.theme === "verao" ? "saira-condensed-latin-900-normal.woff" : "tiny5-latin-400-normal.woff")),
  readFile(join(process.cwd(), "public", EDITION.emblem.raster)),
  readFile(join(process.cwd(), "public/brand/sindserm-branca.png")),
]);
const EMBLEM_MIME = EDITION.emblem.raster.endsWith(".png") ? "image/png" : "image/jpeg";

const { width: WIDTH, height: HEIGHT } = VOUCHER_IMAGE;
// Cores da festa desta edição: vermelho e preto (anos 80) ou as da logo do verão (vermelho do pôr do sol sobre o azul da noite).
const SUMMER = EDITION.theme === "verao";
const RED = SUMMER ? "#ff5a2e" : "#ff2626";
const RED_RGB = SUMMER ? "255,90,46" : "255,38,38";
const CARD = SUMMER ? "#141f46" : "#0e0e0f";
const TAG_MEMBER = SUMMER ? "#f23c1c" : "#e3000f";
const TAG_GUEST = SUMMER ? "#223064" : "#232326";
const FG = SUMMER ? "#fff6e8" : "#f5f4f1";
const MUTED = SUMMER ? "#c8c6dc" : "#a8a49e";
const LINE = SUMMER ? "#3b4c90" : "#3b3b41";
const LINE_SOFT = SUMMER ? "#2b3a72" : "#26262a";
const AMBER = "#f8c000";

/** O "metal" do passe da casa por categoria (o mesmo do voucher na tela). */
const METAL: Record<EmployeeCategory, { accent: string; rgb: string; tagText: string; tag: string }> = {
  BOARD: { accent: "#e4e4e7", rgb: "228,228,231", tagText: "#0e0e0f", tag: "DIRETORIA" },
  STAFF: { accent: AMBER, rgb: "248,192,0", tagText: "#1a1300", tag: "FUNCIONÁRIO(A)" },
  CONTRACTOR: { accent: "#22d3ee", rgb: "34,211,238", tagText: "#0e0e0f", tag: "PRESTADOR(A)" },
  COURTESY: { accent: "#ff4fb4", rgb: "255,79,180", tagText: "#1a0010", tag: "CORTESIA" },
};
const INK = SUMMER ? "#0b1330" : "#080808";
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
  const emblemSrc = `data:${EMBLEM_MIME};base64,${emblem.toString("base64")}`;
  const unionLogoSrc = `data:image/png;base64,${unionLogo.toString("base64")}`;
  const isMember = card.kind === "MEMBER";
  // Colaborador(a) do SINDSERM: "passe da casa" no metal da categoria, para não confundir com o voucher dos filiados.
  const isEmployee = card.kind === "EMPLOYEE";
  const category: EmployeeCategory = card.category ?? "STAFF";
  const metal = METAL[category];
  // Inscrição na hora: voucher amarelo (kit da gordura), para a mesa dos kits reconhecer de longe.
  const walkIn = Boolean(card.walkIn) && !isEmployee;
  const accent = isEmployee ? metal.accent : walkIn ? "#ffd23f" : RED;
  const glowRgb = isEmployee ? metal.rgb : walkIn ? "255,210,63" : RED_RGB;
  // Na faixa do kit, só o primeiro nome: o nome completo já está no voucher de cada pessoa.
  const guestFirst = card.guestName ? firstName(card.guestName) : null;
  // Kit dividido: um kit por inscrição, para os dois (o convidado de filiado(a) não tem kit próprio).
  const shared = EDITION.sharedKit;
  const kitLine = isEmployee
    ? card.withoutKit
      ? "Entrada sem kit de consumação"
      : guestFirst
        ? shared
          ? `1 kit de consumação, para dividir com ${guestFirst}`
          : `2 kits de consumação: o seu e o de ${guestFirst}`
        : "1 kit de consumação"
    : walkIn
      ? isMember && guestFirst
        ? shared
          ? `1 kit da gordura, para dividir com ${guestFirst}`
          : `Kits da gordura: o seu e o de ${guestFirst}`
        : "1 kit da gordura (inscrição na hora)"
      : card.kitWaitlist?.self
      ? `Kit na fila do kit (nº ${card.kitWaitlist.self}): sai se vagar`
      : isMember
        ? card.isTeacher
          ? card.kitWaitlist?.guest
            ? `Seu kit garantido; o de ${guestFirst ?? "convidado"} na fila (nº ${card.kitWaitlist.guest})`
            : guestFirst
              ? shared
                ? `1 kit de consumação, para dividir com ${guestFirst}`
                : `2 kits de consumação: o seu e o de ${guestFirst}`
              : "1 kit de consumação"
          : "Participação sem kit de consumação"
        : shared
          ? `Kit dividido: o de ${card.hostName ? firstName(card.hostName) : "quem te convidou"} é para os dois`
          : `1 kit de consumação, depois que ${card.hostName ? firstName(card.hostName) : "quem te convidou"} chegar`;
  const tag = isEmployee ? metal.tag : GAME.player[isMember ? 1 : 2];
  const subtitle = isEmployee
    ? card.broughtByName
      ? `Convidado(a) de ${properName(card.broughtByName)}`
      : employeeTitleLine(category, card.jobTitle)
    : isMember
      ? card.isTeacher
        ? T.personAffiliated
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
            background: CARD,
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
                  background: isEmployee ? metal.accent : isMember ? TAG_MEMBER : TAG_GUEST,
                  color: isEmployee ? metal.tagText : "#ffffff",
                }}
              >
                {tag}
              </div>
              <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 28, letterSpacing: 2, color: isEmployee ? metal.accent : walkIn ? "#ffd23f" : MUTED }}>
                {isEmployee ? (category === "COURTESY" ? "CONVITE ESPECIAL" : "PASSE DA CASA") : walkIn ? "NA HORA" : GAME.admitOne.toUpperCase()}
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
                color: FG,
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
                color: isEmployee ? metal.accent : MUTED,
              }}
            >
              {subtitle}
            </div>
          </div>

          <div style={{ ...KEEP, display: "flex", margin: "32px 48px 0", borderTop: `5px dashed ${LINE}` }} />

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
            <div style={{ ...KEEP, display: "flex", marginTop: 34, fontSize: 60, lineHeight: 1.1, fontWeight: 700, letterSpacing: 12, color: FG }}>
              {card.code}
            </div>
            <div style={{ ...KEEP, display: "flex", marginTop: 18, fontSize: 32, lineHeight: LINE_HEIGHT, fontWeight: 700, color: MUTED }}>
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
                  color: MUTED,
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
                color: FG,
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
              borderTop: `2px solid ${LINE_SOFT}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- renderizado pelo Satori */}
            <img src={unionLogoSrc} width={308} height={88} alt="" />
            {event.helpWhatsapp ? (
              <div style={{ display: "flex", marginTop: 12, fontSize: 26, lineHeight: LINE_HEIGHT, fontWeight: 700, color: MUTED }}>
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
