import "server-only";

/*
 * Prévia de PDF (RG, contracheque, ficha assinada): desenha uma página como
 * imagem no servidor (pdf.js via unpdf, com o canvas nativo @napi-rs/canvas).
 * Assim a miniatura aparece na lista e na ficha, e o visualizador funciona até
 * no celular, que não abre PDF dentro da página.
 */

/** Largura da miniatura (lista e ficha). */
export const PREVIEW_WIDTH = 360;
/** Largura de cada página no visualizador (nítida no celular e no computador). */
export const PAGE_WIDTH = 1240;
/** Páginas mostradas no visualizador; o resto, abrindo o arquivo original. */
export const MAX_VIEWER_PAGES = 8;

export class PdfPreviewError extends Error {}

/**
 * Desenha a página `pageNumber` (começando em 1) com a largura pedida e devolve
 * um JPEG e o total de páginas. PDF quebrado ou página inexistente: PdfPreviewError.
 */
export async function renderPdfPage(bytes: Buffer, pageNumber: number, width: number): Promise<{ jpeg: Buffer; pages: number }> {
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // Cópia: o pdf.js fica com o buffer que recebe. A versão do unpdf não gera código a partir do arquivo (sem eval).
    pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  } catch {
    throw new PdfPreviewError("Não foi possível ler este PDF.");
  }
  try {
    const pages = pdf.numPages;
    if (pageNumber < 1 || pageNumber > pages) throw new PdfPreviewError("Página inexistente.");
    const png = await renderPageAsImage(pdf, pageNumber, { canvasImport: () => import("@napi-rs/canvas"), width });
    const { default: sharp } = await import("sharp");
    const jpeg = await sharp(Buffer.from(png)).flatten({ background: "#ffffff" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return { jpeg, pages };
  } catch (error) {
    if (error instanceof PdfPreviewError) throw error;
    throw new PdfPreviewError("Não foi possível desenhar a página.");
  } finally {
    // Libera a memória do documento (o nome do método muda entre versões do pdf.js).
    const disposable = pdf as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> };
    await (disposable.destroy ?? disposable.cleanup)?.call(pdf).catch(() => undefined);
  }
}
