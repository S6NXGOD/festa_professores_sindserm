/*
 * Medidas da imagem do voucher (1080×1920, formato de status). Nome longo,
 * "Convidado(a) de ..." em duas linhas, faixa do kit e aviso de filiação somam
 * altura: em vez de a faixa do kit ser espremida (e o texto vazar para fora da
 * borda), o emblema e depois o QR Code encolhem só o necessário para tudo caber.
 */

export const VOUCHER_IMAGE = {
  width: 1080,
  height: 1920,
  pagePadding: 44,
  border: 6,
  sidePadding: 64,
  emblem: { width: 560, height: 481, minHeight: 300 },
  qr: { size: 400, minSize: 320 },
} as const;

/** Altura útil dentro da moldura. */
const INNER_HEIGHT = VOUCHER_IMAGE.height - 2 * VOUCHER_IMAGE.pagePadding - 2 * VOUCHER_IMAGE.border;
/** Largura dos textos (nome, subtítulo, faixa do kit). */
export const TEXT_WIDTH = VOUCHER_IMAGE.width - 2 * VOUCHER_IMAGE.pagePadding - 2 * VOUCHER_IMAGE.border - 2 * VOUCHER_IMAGE.sidePadding;
/** Espaço de sobra para diferenças entre a estimativa e o desenho real. */
const SAFETY = 28;

/** Altura de linha usada em todos os textos da imagem (fixa, para a conta bater). */
export const LINE_HEIGHT = 1.25;
export const NAME_LINE_HEIGHT = 0.95;

/** Largura média de um caractere, em "em", com folga (Saira normal e Saira Condensed em maiúsculas). */
const CHAR_EM = { text: 0.53, name: 0.47 } as const;

const NAME_SIZES = [96, 80, 66, 56, 48] as const;

export const KIT_BOX = { marginTop: 30, paddingY: 20, paddingX: 28, border: 3, fontSize: 30 } as const;

/** Quantas linhas o texto ocupa, quebrando por palavra (estimativa conservadora). */
export function estimateLines(text: string, fontSize: number, width: number, charEm: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const charWidth = fontSize * charEm;
  let lines = 1;
  let current = 0;
  for (const word of words) {
    const wordWidth = word.length * charWidth;
    const next = current === 0 ? wordWidth : current + charWidth + wordWidth;
    if (next > width && current > 0) {
      lines += 1;
      current = wordWidth;
    } else {
      current = next;
    }
  }
  return lines;
}

export interface VoucherImageTexts {
  fullName: string;
  subtitle: string;
  kitLine: string;
  statusLine: string | null;
  venue: string | null;
  hasHelp: boolean;
}

export interface VoucherImageLayout {
  nameSize: number;
  emblemWidth: number;
  emblemHeight: number;
  qrSize: number;
  /** Altura estimada do conteúdo (para os testes conferirem que cabe). */
  contentHeight: number;
  available: number;
}

export function voucherImageLayout(texts: VoucherImageTexts): VoucherImageLayout {
  const nameSize = NAME_SIZES.find((size) => estimateLines(texts.fullName, size, TEXT_WIDTH, CHAR_EM.name) <= 2) ?? 48;
  const nameLines = estimateLines(texts.fullName, nameSize, TEXT_WIDTH, CHAR_EM.name);
  const kitWidth = TEXT_WIDTH - 2 * KIT_BOX.paddingX - 2 * KIT_BOX.border;

  const line = (size: number) => size * LINE_HEIGHT;
  const textBlock = (text: string | null, size: number, width: number, marginTop: number) =>
    text ? marginTop + estimateLines(text, size, width, CHAR_EM.text) * line(size) : 0;

  const fixed =
    16 + // respiro acima do emblema
    8 + 72 + // topo do bloco do nome + selo (PLAYER 1 / ADMIT ONE)
    37 + // linha picotada
    32 + // respiro do bloco do QR
    2 * 18 + // moldura branca do QR
    34 + 60 * 1.1 + // código do voucher
    18 + line(32) + // data e hora
    (texts.hasHelp ? 2 + 18 + 88 + 12 + line(26) + 24 : 2 + 18 + 88 + 24); // rodapé com a marca

  const variable =
    28 + nameLines * nameSize * NAME_LINE_HEIGHT +
    textBlock(texts.subtitle, 36, TEXT_WIDTH, 14) +
    textBlock(texts.venue, 28, TEXT_WIDTH, 6) +
    KIT_BOX.marginTop + 2 * KIT_BOX.paddingY + 2 * KIT_BOX.border + estimateLines(texts.kitLine, KIT_BOX.fontSize, kitWidth, CHAR_EM.text) * line(KIT_BOX.fontSize) +
    textBlock(texts.statusLine, 28, TEXT_WIDTH, 16);

  const available = INNER_HEIGHT - SAFETY;
  let emblemHeight: number = VOUCHER_IMAGE.emblem.height;
  let qrSize: number = VOUCHER_IMAGE.qr.size;
  let overflow = fixed + variable + emblemHeight + qrSize - available;
  if (overflow > 0) {
    const cut = Math.min(overflow, emblemHeight - VOUCHER_IMAGE.emblem.minHeight);
    emblemHeight -= cut;
    overflow -= cut;
  }
  if (overflow > 0) {
    const cut = Math.min(overflow, qrSize - VOUCHER_IMAGE.qr.minSize);
    qrSize -= cut;
    overflow -= cut;
  }
  emblemHeight = Math.floor(emblemHeight);
  qrSize = Math.floor(qrSize);
  return {
    nameSize,
    emblemHeight,
    emblemWidth: Math.round((emblemHeight * VOUCHER_IMAGE.emblem.width) / VOUCHER_IMAGE.emblem.height),
    qrSize,
    contentHeight: Math.ceil(fixed + variable + emblemHeight + qrSize),
    available,
  };
}
