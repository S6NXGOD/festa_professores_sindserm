import { can } from "@/domain/access";
import { DomainError } from "@/server/services/errors";
import { type DeskEvent, subscribeDeskEvents } from "@/server/realtime";
import { requireActionActor } from "@/server/session";

/*
 * Avisos da mesa dos kits em tempo real (Server-Sent Events): entrou alguém,
 * saiu um kit ou houve estorno. A tela da mesa recarrega a fila na hora. Rota
 * GET (não server action): a conexão fica aberta sem ocupar a fila das ações.
 */
export const dynamic = "force-dynamic";

/** Sinal de vida a cada 15 s: proxies não derrubam a conexão parada. */
const HEARTBEAT_MS = 15_000;

export async function GET(request: Request) {
  try {
    const actor = await requireActionActor();
    if (!can(actor.access, "deliverKits")) throw new DomainError("FORBIDDEN", "Sem acesso à mesa dos kits.");
  } catch (error) {
    if (error instanceof DomainError) {
      return new Response(error.message, {
        status: error.code === "UNAUTHENTICATED" ? 401 : 403,
      });
    }
    throw error;
  }

  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };
      const unsubscribe = subscribeDeskEvents((event: DeskEvent) => send(`data: ${JSON.stringify(event)}\n\n`));
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      stop = () => {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Já fechado pelo navegador.
        }
      };
      request.signal.addEventListener("abort", () => stop());
      // Reconexão do navegador em 3 s se cair; "hello" confirma que o fluxo está aberto.
      send("retry: 3000\n\n");
      send(`event: hello\ndata: {}\n\n`);
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: sem compressão (que seguraria os avisos no buffer).
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
