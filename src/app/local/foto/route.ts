import { db } from "@/server/db";
import { getEventPhoto } from "@/server/services/venue";

/**
 * Foto do local da festa (informação pública). As páginas usam a URL com a
 * versão (?v=), então o navegador pode guardar em cache sem ficar desatualizado.
 */
export async function GET() {
  const photo = await getEventPhoto(db);
  if (!photo) return new Response("Sem foto do local", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
