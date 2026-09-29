import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type PDFFont, type PDFImage, type PDFPage, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { splitContributionMonth } from "@/domain/affiliation-text";
import { UNION } from "@/domain/union";
import { formatCpf } from "@/lib/cpf";
import { formatPlainDate } from "@/lib/datetime";
import { formatPhone } from "@/lib/phone";

/*
 * A ficha de filiação em PDF, igual à impressa (ficha + comprovante), para a
 * pessoa assinar pelo gov.br sem esperar a festa. O campo "Assinatura do(a)
 * Servidor(a)" fica bem marcado: é onde a assinatura digital é posicionada.
 */

export interface FichaPdfData {
  id: string;
  formDate: string;
  fullName: string;
  motherName: string;
  fatherName: string | null;
  address: string;
  addressNumber: string;
  neighborhood: string;
  email: string | null;
  whatsapp: string;
  birthDate: string;
  rg: string;
  cpf: string;
  workplace: string;
  registrationNumber: string;
  jobTitle: string;
  admissionDate: string;
  contributionStartMonth: string;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 28;
const RED = rgb(0.89, 0, 0.06);
const GRAY = rgb(0.23, 0.23, 0.23);
const LIGHT = rgb(0.45, 0.45, 0.45);
const BLACK = rgb(0, 0, 0);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  boldItalic: PDFFont;
}

/** Só letras que a fonte padrão do PDF sabe desenhar (o resto perde o acento ou vira "?"). */
function sanitizer(font: PDFFont) {
  const known = new Set(font.getCharacterSet());
  return (text: string) =>
    Array.from(text.normalize("NFC"))
      .map((char) => {
        if (known.has(char.codePointAt(0)!)) return char;
        const bare = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
        return bare && Array.from(bare).every((c) => known.has(c.codePointAt(0)!)) ? bare : "?";
      })
      .join("");
}

/** Retângulo de cantos arredondados (a moldura vermelha da ficha oficial). */
function roundedBox(page: PDFPage, x: number, top: number, width: number, height: number, radius: number, borderWidth: number) {
  const r = radius;
  const path = `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: top, borderColor: RED, borderWidth });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** "Rótulo: ______ VALOR ______" com o valor em maiúsculas, cabendo na largura. */
function field(page: PDFPage, fonts: Fonts, clean: (t: string) => string, x: number, y: number, width: number, label: string, value: string, upper = true) {
  const labelSize = 9;
  const labelWidth = fonts.regular.widthOfTextAtSize(label, labelSize);
  page.drawText(label, { x, y, size: labelSize, font: fonts.regular, color: GRAY });
  const start = x + labelWidth + 4;
  page.drawLine({ start: { x: start, y: y - 2.5 }, end: { x: x + width, y: y - 2.5 }, thickness: 0.6, color: BLACK });
  let text = clean(upper ? value.toLocaleUpperCase("pt-BR") : value);
  let size = 9.5;
  const room = x + width - start - 4;
  while (size > 6 && fonts.bold.widthOfTextAtSize(text, size) > room) size -= 0.5;
  while (text && fonts.bold.widthOfTextAtSize(text, size) > room) text = text.slice(0, -1);
  page.drawText(text, { x: start + 2, y, size, font: fonts.bold, color: BLACK });
}

function signatures(page: PDFPage, fonts: Fonts, left: number, width: number, y: number, highlight: boolean) {
  const gap = 36;
  const column = (width - gap) / 2;
  const items = [
    { x: left, label: `Diretor(a) do ${UNION.shortName}` },
    { x: left + column + gap, label: "Assinatura do(a) Servidor(a)" },
  ];
  for (const [index, item] of items.entries()) {
    const own = index === 1;
    if (own && highlight) {
      // O lugar da assinatura digital: um fundo claro para achar fácil no assinador do gov.br.
      page.drawRectangle({ x: item.x, y: y + 2, width: column, height: 34, color: rgb(1, 0.95, 0.95), borderColor: RED, borderWidth: 0.6, borderDashArray: [3, 2] });
    }
    page.drawLine({ start: { x: item.x, y }, end: { x: item.x + column, y }, thickness: 0.8, color: BLACK });
    const labelWidth = fonts.regular.widthOfTextAtSize(item.label, 9);
    page.drawText(item.label, { x: item.x + (column - labelWidth) / 2, y: y - 11, size: 9, font: own ? fonts.bold : fonts.regular, color: BLACK });
  }
}

function centered(page: PDFPage, font: PDFFont, text: string, size: number, y: number, color = BLACK) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (A4.width - width) / 2, y, size, font, color });
}

/** O logo do sindicato reduzido (o original tem 300 KB): o PDF fica leve para o WhatsApp. */
let logoBytes: Promise<Buffer | null> | null = null;

async function loadLogo(doc: PDFDocument): Promise<PDFImage | null> {
  logoBytes ??= (async () => {
    try {
      const { default: sharp } = await import("sharp");
      return await sharp(await readFile(join(process.cwd(), "public/logo_base.png")))
        .resize({ width: 640 })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
    } catch {
      return null;
    }
  })();
  const bytes = await logoBytes;
  return bytes ? doc.embedPng(bytes) : null;
}

export async function buildFichaPdf(form: FichaPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Ficha de filiação — ${form.fullName}`);
  doc.setAuthor(UNION.fullName);
  doc.setSubject("Ficha de filiação para assinatura pelo gov.br");
  doc.setCreator(UNION.brand);
  const page = doc.addPage([A4.width, A4.height]);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const clean = sanitizer(fonts.regular);
  const logo = await loadLogo(doc);
  const { month, year } = splitContributionMonth(form.contributionStartMonth);
  const date = formatPlainDate(form.formDate);
  const left = MARGIN + 14;
  const inner = A4.width - 2 * left;
  const info = clean(`${UNION.address} / ${UNION.phone} / ${UNION.email}`);

  // ---------------- Ficha de filiação ----------------
  const fichaTop = A4.height - MARGIN;
  const fichaHeight = 482;
  roundedBox(page, MARGIN, fichaTop, A4.width - 2 * MARGIN, fichaHeight, 16, 2.4);
  // Cabeçalho com o logo e os dados do sindicato.
  roundedBox(page, left - 4, fichaTop - 10, inner + 8, 96, 12, 1.4);
  if (logo) {
    const height = 50;
    const width = (logo.width / logo.height) * height;
    page.drawImage(logo, { x: (A4.width - width) / 2, y: fichaTop - 68, width, height });
  }
  page.drawLine({ start: { x: left + 6, y: fichaTop - 74 }, end: { x: A4.width - left - 6, y: fichaTop - 74 }, thickness: 0.8, color: RED });
  centered(page, fonts.bold, info, 7.5, fichaTop - 85, GRAY);
  centered(page, fonts.bold, `CNPJ: ${UNION.cnpj}`, 7.5, fichaTop - 95, GRAY);

  centered(page, fonts.boldItalic, "FICHA DE FILIAÇÃO", 17, fichaTop - 128, RED);
  field(page, fonts, clean, A4.width - left - 150, fichaTop - 148, 150, "Data:", date);

  let y = fichaTop - 172;
  const row = 22;
  const half = (inner - 16) / 2;
  field(page, fonts, clean, left, y, inner, "Nome:", form.fullName);
  y -= row;
  field(page, fonts, clean, left, y, inner, "Mãe:", form.motherName);
  y -= row;
  field(page, fonts, clean, left, y, inner, "Pai:", form.fatherName ?? "");
  y -= row;
  field(page, fonts, clean, left, y, inner, "End.:", form.address);
  y -= row;
  field(page, fonts, clean, left, y, inner * 0.72, "Bairro:", form.neighborhood);
  field(page, fonts, clean, left + inner * 0.72 + 16, y, inner * 0.28 - 16, "nº,", form.addressNumber);
  y -= row;
  field(page, fonts, clean, left, y, inner * 0.58, "E-mail:", form.email ? form.email.toLowerCase() : "", false);
  field(page, fonts, clean, left + inner * 0.58 + 16, y, inner * 0.42 - 16, "Fone (whatsapp)", formatPhone(form.whatsapp));
  y -= row;
  const third = (inner - 32) / 3;
  field(page, fonts, clean, left, y, third, "Data de nasc.:", formatPlainDate(form.birthDate));
  field(page, fonts, clean, left + third + 16, y, third, "RG.:", form.rg);
  field(page, fonts, clean, left + 2 * (third + 16), y, third, "CPF:", formatCpf(form.cpf));
  y -= row;
  field(page, fonts, clean, left, y, half + 40, "Lotação:", form.workplace);
  field(page, fonts, clean, left + half + 56, y, half - 40, "Matrícula:", form.registrationNumber);
  y -= row;
  field(page, fonts, clean, left, y, half + 40, "Cargo/Função:", form.jobTitle);
  field(page, fonts, clean, left + half + 56, y, half - 40, "Data de admissão:", formatPlainDate(form.admissionDate));

  // Autorização de desconto, como na ficha oficial.
  y -= 30;
  const authorization = clean(
    `AUTORIZO QUE SEJA DESCONTADO, EM FAVOR DO ${UNION.shortName}, O VALOR CORRESPONDENTE A 1% (UM POR CENTO) DO MEU SALÁRIO BASE, A PARTIR DO MÊS DE ${(month || "________").toLocaleUpperCase("pt-BR")} DO ANO DE ${year || "______"}.`,
  );
  for (const line of wrap(authorization, fonts.bold, 9.5, inner)) {
    page.drawText(line, { x: left, y, size: 9.5, font: fonts.bold, color: BLACK });
    y -= 13.5;
  }
  signatures(page, fonts, left, inner, fichaTop - fichaHeight + 40, true);

  // Orientação para quem assina no celular (fora da moldura, discreta).
  const hint = "Assinatura digital: no assinador do gov.br, posicione a sua assinatura no campo “Assinatura do(a) Servidor(a)”, destacado acima.";
  centered(page, fonts.regular, clean(hint), 7.5, fichaTop - fichaHeight - 12, LIGHT);

  // ---------------- Destacar ----------------
  const cut = fichaTop - fichaHeight - 30;
  page.drawLine({ start: { x: MARGIN, y: cut }, end: { x: A4.width - MARGIN, y: cut }, thickness: 0.5, color: LIGHT, dashArray: [4, 3] });
  centered(page, fonts.regular, "destacar", 6.5, cut + 3, LIGHT);

  // ---------------- Comprovante de filiação ----------------
  const proofTop = cut - 12;
  const proofHeight = 232;
  roundedBox(page, MARGIN, proofTop, A4.width - 2 * MARGIN, proofHeight, 16, 2.4);
  centered(page, fonts.boldItalic, "COMPROVANTE DE FILIAÇÃO", 15, proofTop - 28, RED);
  field(page, fonts, clean, A4.width - left - 150, proofTop - 48, 150, "Data:", date);
  field(page, fonts, clean, left, proofTop - 72, inner, "Nome:", form.fullName);
  field(page, fonts, clean, left, proofTop - 94, half + 40, "Lotação:", form.workplace);
  field(page, fonts, clean, left + half + 56, proofTop - 94, half - 40, "Matrícula:", form.registrationNumber);
  signatures(page, fonts, left, inner, proofTop - 140, false);
  // Rodapé com o logo e os dados do sindicato.
  const footerTop = proofTop - 168;
  roundedBox(page, left - 4, footerTop, inner + 8, 54, 8, 1.4);
  let textX = left + 8;
  if (logo) {
    const height = 30;
    const width = (logo.width / logo.height) * height;
    page.drawImage(logo, { x: left + 6, y: footerTop - 42, width, height });
    textX = left + 16 + width;
  }
  page.drawText(clean(UNION.fullName), { x: textX, y: footerTop - 20, size: 8, font: fonts.bold, color: GRAY });
  for (const [index, line] of wrap(`${info} · CNPJ: ${UNION.cnpj}`, fonts.regular, 7, A4.width - left - textX - 8).entries()) {
    page.drawText(line, { x: textX, y: footerTop - 31 - index * 9, size: 7, font: fonts.regular, color: GRAY });
  }
  page.drawText(`Ref. ${form.id.slice(0, 8).toUpperCase()}`, { x: A4.width - MARGIN - 44, y: MARGIN - 14, size: 6.5, font: fonts.regular, color: LIGHT });

  return doc.save();
}

/** "ficha-filiacao-maria-souza.pdf" */
export function fichaFileName(fullName: string): string {
  const slug = fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  return `ficha-filiacao-${slug || "sindserm"}.pdf`;
}
