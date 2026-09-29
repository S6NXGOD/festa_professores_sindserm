import { readDocument } from "@/server/services/documents";
import { DomainError } from "@/server/services/errors";
import { requireActionActor } from "@/server/session";

/*
 * Abre a cópia do RG, do contracheque ou da ficha assinada (só a equipe).
 * `?miniatura=1` devolve uma prévia pequena (foto, ou a 1ª página do PDF);
 * `?pagina=N` desenha a página N do PDF para o visualizador (cabeçalho X-Page-Count).
 * O PDF abre no visualizador do navegador: por isso esta rota tem uma política
 * de segurança própria (ver next.config.ts), sem o bloqueio de "object".
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS: Partial<Record<DomainError["code"], number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404 };

export async function GET(request: Request, context: RouteContext<"/api/documentos/[id]">) {
  const { id } = await context.params;
  if (!UUID.test(id)) return new Response("Documento não encontrado.", { status: 404 });
  try {
    const actor = await requireActionActor();
    const search = new URL(request.url).searchParams;
    const thumbnail = search.get("miniatura") === "1";
    const pageParam = Number(search.get("pagina") ?? "");
    const page = Number.isInteger(pageParam) && pageParam >= 1 && pageParam <= 200 ? pageParam : undefined;
    const document = await readDocument(actor, id, { thumbnail, page });
    return new Response(new Uint8Array(document.bytes), {
      headers: {
        "Content-Type": document.contentType,
        "Content-Disposition": `inline; filename="${document.fileName}"`,
        // Dado sensível: nada de cache compartilhado nem cópia guardada pelo navegador.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(document.pages ? { "X-Page-Count": String(document.pages) } : {}),
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return new Response(error.message, { status: STATUS[error.code] ?? 400 });
    console.error("Abrir documento:", error instanceof Error ? error.name : typeof error);
    return new Response("Não foi possível abrir o documento.", { status: 500 });
  }
}
