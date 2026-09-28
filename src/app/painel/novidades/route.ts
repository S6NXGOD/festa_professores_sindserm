import { can } from "@/domain/access";
import { queueCounts, registrationStatusCounts, registrationsSince } from "@/server/queries/panel";
import { DomainError } from "@/server/services/errors";
import { requireActionActor } from "@/server/session";

/*
 * Radar do painel: inscrições novas desde o instante pedido (a tela toca o
 * level up e mostra os nomes). Rota GET em vez de server action: uma consulta
 * periódica não pode ocupar a fila das ações e travar os cliques da tela.
 */

/** Janela extra para trás: inscrição gravada numa transação que começou um pouco antes (a tela ignora repetidas). */
const OVERLAP_MS = 60_000;
/** Nunca olha mais de um dia para trás (aba esquecida aberta). */
const MAX_LOOKBACK_MS = 86_400_000;

export async function GET(request: Request) {
  try {
    const actor = await requireActionActor();
    if (!can(actor.access, "viewRegistrations")) throw new DomainError("FORBIDDEN", "Sem acesso às inscrições.");
    const now = Date.now();
    const param = new URL(request.url).searchParams.get("desde");
    const requested = param ? Date.parse(param) : Number.NaN;
    const since = new Date(Math.max(Number.isNaN(requested) ? now : requested, now - MAX_LOOKBACK_MS) - OVERLAP_MS);
    const [found, counts, totals] = await Promise.all([
      registrationsSince(since, { excludeUserId: actor.userId }),
      queueCounts(),
      registrationStatusCounts(),
    ]);
    return Response.json(
      {
        now: new Date(now).toISOString(),
        items: found.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        total: found.total,
        pending: counts.pending,
        signature: counts.signature,
        // "Inscrição nº 129 · hoje já são 7": o placar do level up.
        registrations: totals.total,
        today: totals.today,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      return new Response(error.message, { status: error.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    console.error("Radar de inscrições:", error instanceof Error ? error.name : typeof error);
    return new Response("Não foi possível consultar as novidades.", { status: 500 });
  }
}
