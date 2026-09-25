import { iconSizeFor } from "@/lib/site-icon";
import { db } from "@/server/db";
import { renderSiteIcon } from "@/server/services/site-icon";

/**
 * Ícone do site (público): `?s=` escolhe o tamanho e `?v=` a versão. Com a
 * versão atual, o navegador guarda de vez; sem ela (ou antiga), guarda por
 * pouco tempo e logo busca o novo. /favicon.ico chega aqui pelo next.config
 * (com o endereço original, sem `?s=`): vai no tamanho de favicon.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fallback = url.pathname.endsWith(".ico") ? 48 : 192;
  const size = iconSizeFor(Number(url.searchParams.get("s")) || fallback);
  const icon = await renderSiteIcon(db, size);
  const current = url.searchParams.get("v") === icon.version;
  return new Response(new Uint8Array(icon.png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": current ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
}
