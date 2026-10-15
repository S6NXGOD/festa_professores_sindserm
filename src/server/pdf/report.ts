import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { type PDFFont, type PDFImage, type PDFPage, PDFDocument, type RGB, rgb } from "pdf-lib";
import { UNION } from "@/domain/union";
import { formatShortDateTime } from "@/lib/datetime";

/*
 * Relatórios em PDF com a cara do sistema: faixa escura com o emblema da festa,
 * títulos em Saira Condensed, etiquetas na fonte pixel e tabelas que quebram de
 * página sozinhas (repetindo o cabeçalho). A folha é branca: imprime bem e
 * fica leve para mandar no WhatsApp.
 */

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 36;
const WIDTH = PAGE.width - 2 * MARGIN;
/** Embaixo de cada página fica o rodapé (página x de y). */
const BOTTOM = 52;

const COLOR = {
  ink: rgb(0.043, 0.043, 0.047),
  red: rgb(0.89, 0, 0.059),
  amber: rgb(0.973, 0.753, 0),
  text: rgb(0.09, 0.09, 0.1),
  muted: rgb(0.36, 0.36, 0.4),
  faint: rgb(0.58, 0.58, 0.62),
  line: rgb(0.86, 0.86, 0.88),
  zebra: rgb(0.966, 0.966, 0.972),
  white: rgb(1, 1, 1),
  soft: rgb(0.8, 0.8, 0.84),
};

export type Tone = "success" | "warning" | "danger" | "neutral" | "red";

const TONE: Record<Tone, { fg: RGB; bg: RGB }> = {
  success: { fg: rgb(0.08, 0.47, 0.22), bg: rgb(0.86, 0.96, 0.89) },
  warning: { fg: rgb(0.6, 0.36, 0.02), bg: rgb(1, 0.94, 0.76) },
  danger: { fg: rgb(0.78, 0.1, 0.1), bg: rgb(0.99, 0.89, 0.89) },
  neutral: { fg: rgb(0.36, 0.36, 0.4), bg: rgb(0.93, 0.93, 0.95) },
  red: { fg: rgb(0.89, 0, 0.059), bg: rgb(1, 0.91, 0.91) },
};

/** Célula de tabela: texto simples ou etiqueta colorida (situação). */
export type Cell = string | { text: string; sub?: string; tone?: Tone; chip?: boolean; bold?: boolean; muted?: boolean };

export interface Column {
  header: string;
  /** Peso da largura (proporcional às outras colunas). */
  width: number;
  align?: "left" | "right" | "center";
}

export interface StatTile {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}

export interface ReportMeta {
  /** "Kits e estoque" */
  title: string;
  /** Etiqueta pixel acima do título ("Relatório · Consumação"). */
  kicker: string;
  eventName: string;
  /** "Sexta, 16/10/2026 · 19h às 2h" */
  eventLine: string;
  generatedBy: string;
  generatedAt: Date;
}

interface Fonts {
  display: PDFFont;
  body: PDFFont;
  bold: PDFFont;
  pixel: PDFFont;
}

const fontsDir = join(process.cwd(), "src/assets/fonts");
const FONT_FILES: Record<keyof Fonts, string> = {
  display: "saira-condensed-latin-900-normal.woff",
  body: "saira-latin-500-normal.woff",
  bold: "saira-latin-700-normal.woff",
  pixel: "tiny5-latin-400-normal.woff",
};

interface Assets {
  fonts: Record<keyof Fonts, Buffer>;
  emblem: Buffer | null;
  logo: Buffer | null;
}

let assets: Promise<Assets> | null = null;

/** Fontes e imagens lidas uma vez (as imagens, reduzidas: o PDF fica leve). */
function loadAssets(): Promise<Assets> {
  assets ??= (async () => {
    const entries = await Promise.all(
      (Object.keys(FONT_FILES) as (keyof Fonts)[]).map(async (key) => [key, await readFile(join(fontsDir, FONT_FILES[key]))] as const),
    );
    const { default: sharp } = await import("sharp");
    const image = async (file: string, resize: (s: ReturnType<typeof sharp>) => Promise<Buffer>) => {
      try {
        return await resize(sharp(await readFile(join(process.cwd(), "public/brand", file))));
      } catch {
        return null;
      }
    };
    const [emblem, logo] = await Promise.all([
      image("festa-emblema.jpg", (s) => s.resize({ width: 300 }).jpeg({ quality: 84, mozjpeg: true }).toBuffer()),
      image("sindserm-branca.png", (s) => s.resize({ height: 80 }).png({ compressionLevel: 9 }).toBuffer()),
    ]);
    return { fonts: Object.fromEntries(entries) as Record<keyof Fonts, Buffer>, emblem, logo };
  })().catch((error: unknown) => {
    assets = null;
    throw error;
  });
  return assets;
}

/** Só letras que a fonte sabe desenhar (o resto perde o acento ou vira "?"). */
function sanitizer(font: PDFFont) {
  const known = new Set(font.getCharacterSet());
  return (text: string) =>
    // Espaços especiais (o "R$ 10,00" da moeda usa um sem quebra): o glifo dele quebra a leitura da Saira Condensed.
    Array.from(text.normalize("NFC").replace(/[\u00a0\u2007\u202f]/g, " "))
      .map((char) => {
        if (char === "\n" || char === "\t") return " ";
        if (known.has(char.codePointAt(0)!)) return char;
        const bare = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
        return bare && Array.from(bare).every((c) => known.has(c.codePointAt(0)!)) ? bare : "?";
      })
      .join("");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // Palavra maior que a coluna (ex.: e-mail): quebra no meio.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** Corta com reticências para caber numa linha. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text.length;
  while (cut > 1 && font.widthOfTextAtSize(`${text.slice(0, cut)}…`, size) > maxWidth) cut--;
  return `${text.slice(0, cut).trimEnd()}…`;
}

/** Retângulo de cantos arredondados (preenchido e/ou com borda). */
function roundedRect(page: PDFPage, x: number, top: number, width: number, height: number, radius: number, options: { fill?: RGB; border?: RGB; borderWidth?: number }) {
  const r = Math.min(radius, height / 2, width / 2);
  const path = `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(path, {
    x,
    y: top,
    color: options.fill,
    borderColor: options.border,
    borderWidth: options.border ? (options.borderWidth ?? 0.8) : 0,
  });
}

const cellText = (cell: Cell) => (typeof cell === "string" ? cell : cell.text);

export class ReportPdf {
  private readonly pages: PDFPage[] = [];
  private page!: PDFPage;
  private y = 0;
  private readonly clean = new Map<PDFFont, (text: string) => string>();

  private constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
    private readonly images: { emblem: PDFImage | null; logo: PDFImage | null },
    private readonly meta: ReportMeta,
  ) {}

  static async create(meta: ReportMeta): Promise<ReportPdf> {
    const loaded = await loadAssets();
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    doc.setTitle(`${meta.title} – ${meta.eventName}`);
    doc.setAuthor(UNION.fullName);
    doc.setSubject(`Relatório: ${meta.title}`);
    doc.setCreator(`Sistema da festa · ${UNION.brand}`);
    doc.setLanguage("pt-BR");
    const fonts: Fonts = {
      display: await doc.embedFont(loaded.fonts.display, { subset: true }),
      body: await doc.embedFont(loaded.fonts.body, { subset: true }),
      bold: await doc.embedFont(loaded.fonts.bold, { subset: true }),
      pixel: await doc.embedFont(loaded.fonts.pixel, { subset: true }),
    };
    const images = {
      emblem: loaded.emblem ? await doc.embedJpg(loaded.emblem) : null,
      logo: loaded.logo ? await doc.embedPng(loaded.logo) : null,
    };
    const report = new ReportPdf(doc, fonts, images, meta);
    report.firstPage();
    return report;
  }

  private sanitize(font: PDFFont, text: string) {
    let clean = this.clean.get(font);
    if (!clean) {
      clean = sanitizer(font);
      this.clean.set(font, clean);
    }
    return clean(text);
  }

  private draw(text: string, options: { x: number; y: number; size: number; font: PDFFont; color?: RGB; maxWidth?: number; align?: "left" | "right" | "center"; opacity?: number }) {
    let value = this.sanitize(options.font, text);
    if (options.maxWidth) value = fit(value, options.font, options.size, options.maxWidth);
    const width = options.font.widthOfTextAtSize(value, options.size);
    const box = options.maxWidth ?? width;
    const x = options.align === "right" ? options.x + box - width : options.align === "center" ? options.x + (box - width) / 2 : options.x;
    this.page.drawText(value, { x, y: options.y, size: options.size, font: options.font, color: options.color ?? COLOR.text, opacity: options.opacity });
    return width;
  }

  private addPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    return this.page;
  }

  /** Primeira página: a faixa do evento (emblema, etiqueta pixel, título e data). */
  private firstPage() {
    const page = this.addPage();
    const band = 122;
    const top = PAGE.height;
    page.drawRectangle({ x: 0, y: top - band, width: PAGE.width, height: band, color: COLOR.ink });
    // Linhas de varredura, como na tela do fliperama.
    for (let line = top - 1.5; line > top - band; line -= 3) {
      page.drawLine({ start: { x: 0, y: line }, end: { x: PAGE.width, y: line }, thickness: 0.35, color: COLOR.white, opacity: 0.04 });
    }
    page.drawRectangle({ x: 0, y: top - band - 3, width: PAGE.width, height: 3, color: COLOR.red });

    let textX = MARGIN;
    const emblem = this.images.emblem;
    if (emblem) {
      const height = 92;
      const width = (emblem.width / emblem.height) * height;
      page.drawImage(emblem, { x: MARGIN - 6, y: top - band + (band - height) / 2, width, height });
      textX = MARGIN - 6 + width + 14;
    }
    const logo = this.images.logo;
    let logoWidth = 0;
    if (logo) {
      const height = 22;
      logoWidth = (logo.width / logo.height) * height;
      page.drawImage(logo, { x: PAGE.width - MARGIN - logoWidth, y: top - 18 - height, width: logoWidth, height });
    }
    const room = PAGE.width - MARGIN - textX - (logoWidth ? logoWidth + 12 : 0);
    this.draw(this.meta.kicker.toUpperCase(), { x: textX, y: top - 34, size: 8, font: this.fonts.pixel, color: COLOR.amber, maxWidth: room });
    this.draw(this.meta.title.toUpperCase(), { x: textX, y: top - 66, size: 30, font: this.fonts.display, color: COLOR.white, maxWidth: PAGE.width - MARGIN - textX });
    this.draw(this.meta.eventName, { x: textX, y: top - 86, size: 9.5, font: this.fonts.bold, color: COLOR.white, maxWidth: PAGE.width - MARGIN - textX });
    this.draw(this.meta.eventLine, { x: textX, y: top - 100, size: 8.5, font: this.fonts.body, color: COLOR.soft, maxWidth: PAGE.width - MARGIN - textX });

    this.y = top - band - 3 - 18;
    this.draw(`Gerado em ${formatShortDateTime(this.meta.generatedAt)} por ${this.meta.generatedBy}`, {
      x: MARGIN,
      y: this.y,
      size: 8.5,
      font: this.fonts.body,
      color: COLOR.muted,
      maxWidth: WIDTH * 0.62,
    });
    this.draw("USO INTERNO · DADOS PESSOAIS", { x: MARGIN, y: this.y, size: 7, font: this.fonts.pixel, color: COLOR.red, maxWidth: WIDTH, align: "right" });
    this.y -= 22;
  }

  /** Páginas seguintes: uma faixa fina com o título. */
  private nextPage() {
    const page = this.addPage();
    const band = 30;
    page.drawRectangle({ x: 0, y: PAGE.height - band, width: PAGE.width, height: band, color: COLOR.ink });
    page.drawRectangle({ x: 0, y: PAGE.height - band - 2, width: PAGE.width, height: 2, color: COLOR.red });
    const title = this.meta.title.toUpperCase();
    const width = this.draw(title, { x: MARGIN, y: PAGE.height - 20, size: 13, font: this.fonts.display, color: COLOR.white });
    this.draw(this.meta.eventName, {
      x: MARGIN + width + 16,
      y: PAGE.height - 19,
      size: 7.5,
      font: this.fonts.body,
      color: COLOR.soft,
      maxWidth: WIDTH - width - 16,
      align: "right",
    });
    this.y = PAGE.height - band - 2 - 24;
  }

  /** Garante espaço na página (senão, começa outra). */
  private ensure(height: number) {
    if (this.y - height < BOTTOM) this.nextPage();
  }

  /** Título de uma parte do relatório, com uma frase de explicação. */
  section(title: string, note?: string) {
    const noteLines = note ? wrapText(this.sanitize(this.fonts.body, note), this.fonts.body, 8.8, WIDTH) : [];
    this.ensure(58 + noteLines.length * 11.5);
    this.y -= 16;
    this.page.drawRectangle({ x: MARGIN, y: this.y - 3, width: 5, height: 17, color: COLOR.red });
    this.draw(title.toUpperCase(), { x: MARGIN + 11, y: this.y, size: 16, font: this.fonts.display, color: COLOR.text, maxWidth: WIDTH - 11 });
    this.y -= 15;
    for (const line of noteLines) {
      this.draw(line, { x: MARGIN, y: this.y, size: 8.8, font: this.fonts.body, color: COLOR.muted });
      this.y -= 11.5;
    }
    this.y -= 6;
  }

  /** Subtítulo pequeno (ex.: o grupo de uma lista). */
  subheading(text: string, detail?: string) {
    this.ensure(48);
    this.y -= 14;
    const width = this.draw(text.toUpperCase(), { x: MARGIN, y: this.y, size: 7.5, font: this.fonts.pixel, color: COLOR.red, maxWidth: WIDTH });
    if (detail) this.draw(detail, { x: MARGIN + width + 8, y: this.y, size: 8, font: this.fonts.body, color: COLOR.muted, maxWidth: WIDTH - width - 8 });
    this.y -= 9;
  }

  /** Números grandes em cartões (até 4 por linha). */
  stats(tiles: StatTile[]) {
    const gap = 8;
    const height = 60;
    for (let start = 0; start < tiles.length; start += 4) {
      const row = tiles.slice(start, start + 4);
      const perRow = Math.max(row.length, Math.min(4, tiles.length));
      const width = (WIDTH - gap * (perRow - 1)) / perRow;
      this.ensure(height + gap);
      row.forEach((tile, index) => {
        const x = MARGIN + index * (width + gap);
        const tone = TONE[tile.tone ?? "neutral"];
        roundedRect(this.page, x, this.y, width, height, 7, { fill: COLOR.white, border: COLOR.line });
        this.page.drawRectangle({ x: x + 0.4, y: this.y - height + 8, width: 3, height: height - 16, color: tile.tone ? tone.fg : COLOR.soft });
        this.draw(tile.label.toUpperCase(), { x: x + 11, y: this.y - 15, size: 6.8, font: this.fonts.bold, color: COLOR.muted, maxWidth: width - 18 });
        this.draw(tile.value, { x: x + 11, y: this.y - 40, size: 23, font: this.fonts.display, color: tile.tone ? tone.fg : COLOR.text, maxWidth: width - 18 });
        if (tile.hint) this.draw(tile.hint, { x: x + 11, y: this.y - 52, size: 7.2, font: this.fonts.body, color: COLOR.muted, maxWidth: width - 18 });
      });
      this.y -= height + gap;
    }
    this.y -= 4;
  }

  /** Texto corrido. */
  paragraph(text: string, options: { size?: number; color?: RGB; bold?: boolean } = {}) {
    const size = options.size ?? 9.2;
    const font = options.bold ? this.fonts.bold : this.fonts.body;
    const lineHeight = size * 1.35;
    this.y -= 2;
    for (const line of wrapText(this.sanitize(font, text), font, size, WIDTH)) {
      this.ensure(lineHeight + 4);
      // `y` é o topo livre: a linha desce o tamanho da letra até a base.
      this.draw(line, { x: MARGIN, y: this.y - size, size, font, color: options.color ?? COLOR.text });
      this.y -= lineHeight;
    }
    this.y -= 6;
  }

  /** Aviso em destaque (faixa colorida à esquerda). */
  callout(text: string, tone: Tone = "warning") {
    const size = 8.8;
    const lines = wrapText(this.sanitize(this.fonts.bold, text), this.fonts.bold, size, WIDTH - 24);
    const height = lines.length * 11.5 + 12;
    this.ensure(height + 6);
    const colors = TONE[tone];
    roundedRect(this.page, MARGIN, this.y, WIDTH, height, 6, { fill: colors.bg });
    this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: 4, height, color: colors.fg });
    let lineY = this.y - 15;
    for (const line of lines) {
      this.draw(line, { x: MARGIN + 14, y: lineY, size, font: this.fonts.bold, color: colors.fg });
      lineY -= 11.5;
    }
    this.y -= height + 10;
  }

  /** Tabela que quebra de página sozinha (o cabeçalho se repete). */
  table(columns: Column[], rows: Cell[][], options: { empty?: string; total?: Cell[] } = {}) {
    const weight = columns.reduce((sum, column) => sum + column.width, 0);
    const widths = columns.map((column) => (column.width / weight) * WIDTH);
    const padX = 5;
    const size = 8.4;
    const lineHeight = 10.6;
    const headerHeight = 19;

    const header = () => {
      this.page.drawRectangle({ x: MARGIN, y: this.y - headerHeight, width: WIDTH, height: headerHeight, color: COLOR.ink });
      let x = MARGIN;
      columns.forEach((column, index) => {
        this.draw(column.header.toUpperCase(), {
          x: x + padX,
          y: this.y - 12.5,
          size: 6.6,
          font: this.fonts.bold,
          color: COLOR.white,
          maxWidth: widths[index]! - 2 * padX,
          align: column.align,
        });
        x += widths[index]!;
      });
      this.y -= headerHeight;
    };

    const subSize = 7.2;
    const subHeight = 9.2;
    const fontOf = (cell: Cell) => (typeof cell !== "string" && (cell.bold || cell.chip) ? this.fonts.bold : this.fonts.body);
    const rowLines = (row: Cell[]) =>
      row.map((cell, index) => {
        const room = widths[index]! - 2 * padX;
        const sub = typeof cell !== "string" && cell.sub ? wrapText(this.sanitize(this.fonts.body, cell.sub), this.fonts.body, subSize, room).slice(0, 2) : [];
        if (typeof cell !== "string" && cell.chip) return { lines: [this.sanitize(this.fonts.bold, cell.text)], sub };
        const font = fontOf(cell);
        return { lines: wrapText(this.sanitize(font, cellText(cell)), font, size, room).slice(0, 3), sub };
      });

    const drawRow = (row: Cell[], index: number, total = false) => {
      const cells = rowLines(row);
      const height = Math.max(lineHeight, ...cells.map((cell) => cell.lines.length * lineHeight + cell.sub.length * subHeight)) + 9;
      if (this.y - height < BOTTOM) {
        this.nextPage();
        header();
      }
      if (total) {
        this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: WIDTH, height, color: rgb(0.93, 0.93, 0.95) });
        this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + WIDTH, y: this.y }, thickness: 1, color: COLOR.ink });
      } else if (index % 2 === 1) {
        this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: WIDTH, height, color: COLOR.zebra });
      }
      let x = MARGIN;
      row.forEach((cell, column) => {
        const width = widths[column]!;
        const align = columns[column]?.align;
        const cellLines = cells[column]!.lines;
        const subLines = cells[column]!.sub;
        if (typeof cell !== "string" && cell.chip) {
          const tone = TONE[cell.tone ?? "neutral"];
          const text = fit(cellLines[0] ?? "", this.fonts.bold, 7, width - 2 * padX - 10);
          const chipWidth = this.fonts.bold.widthOfTextAtSize(text, 7) + 10;
          const chipX = align === "right" ? x + width - padX - chipWidth : align === "center" ? x + (width - chipWidth) / 2 : x + padX;
          roundedRect(this.page, chipX, this.y - 4.5, chipWidth, 12.5, 6.25, { fill: tone.bg });
          this.page.drawText(text, { x: chipX + 5, y: this.y - 13.4, size: 7, font: this.fonts.bold, color: tone.fg });
        } else {
          const color = typeof cell === "string" ? COLOR.text : cell.muted ? COLOR.muted : cell.tone ? TONE[cell.tone].fg : COLOR.text;
          cellLines.forEach((line, lineIndex) => {
            this.draw(line, {
              x: x + padX,
              y: this.y - 13 - lineIndex * lineHeight,
              size,
              font: total ? this.fonts.bold : fontOf(cell),
              color,
              maxWidth: width - 2 * padX,
              align,
            });
          });
        }
        subLines.forEach((line, lineIndex) => {
          const top = typeof cell !== "string" && cell.chip ? this.y - 13 - lineHeight : this.y - 13 - cellLines.length * lineHeight;
          this.draw(line, { x: x + padX, y: top - 1 - lineIndex * subHeight, size: subSize, font: this.fonts.body, color: COLOR.muted, maxWidth: width - 2 * padX, align });
        });
        x += width;
      });
      this.page.drawLine({ start: { x: MARGIN, y: this.y - height }, end: { x: MARGIN + WIDTH, y: this.y - height }, thickness: 0.4, color: COLOR.line });
      this.y -= height;
    };

    this.ensure(headerHeight + lineHeight + 12);
    header();
    if (rows.length === 0) {
      drawRow([{ text: options.empty ?? "Nada por aqui.", muted: true }, ...columns.slice(1).map(() => "")], 0);
    } else {
      rows.forEach((row, index) => drawRow(row, index));
    }
    if (options.total) drawRow(options.total, 0, true);
    this.y -= 12;
  }

  /** Desenha o rodapé de todas as páginas e devolve o arquivo. */
  async finish(): Promise<Uint8Array> {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      this.page = page;
      page.drawLine({ start: { x: MARGIN, y: 32 }, end: { x: PAGE.width - MARGIN, y: 32 }, thickness: 0.5, color: COLOR.line });
      this.draw(`${this.meta.eventName} · ${this.meta.title}`, { x: MARGIN, y: 20, size: 7.2, font: this.fonts.body, color: COLOR.faint, maxWidth: WIDTH - 90 });
      this.draw(`Página ${index + 1} de ${total}`, { x: MARGIN, y: 20, size: 7.2, font: this.fonts.bold, color: COLOR.muted, maxWidth: WIDTH, align: "right" });
    });
    return this.doc.save();
  }
}
