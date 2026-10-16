import { can } from "@/domain/access";
import { db } from "@/server/db";
import { deskStockOf, listDeskQueue } from "@/server/services/desk";
import { DomainError } from "@/server/services/errors";
import { getStockOverview } from "@/server/services/settings";
import { requireActionActor } from "@/server/session";

/*
 * Fila da mesa dos kits: quem passou pela entrada e ainda não pegou o kit, e o
 * saldo das caixas. Rota GET (e não server action): a consulta periódica não
 * pode ocupar a fila das ações e travar o botão de entregar.
 */
export async function GET() {
  try {
    const actor = await requireActionActor();
    if (!can(actor.access, "deliverKits")) throw new DomainError("FORBIDDEN", "Sem acesso à mesa dos kits.");
    const [queue, stock] = await Promise.all([listDeskQueue(db), getStockOverview(db)]);
    return Response.json(
      {
        now: new Date().toISOString(),
        pending: queue.pending,
        delivered: queue.delivered,
        minorKit: queue.minorKit,
        items: queue.items.map((item) => ({ ...item, checkedInAt: item.checkedInAt.toISOString() })),
        stock: deskStockOf(stock),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      return new Response(error.message, { status: error.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    console.error("Fila da mesa dos kits:", error instanceof Error ? error.name : typeof error);
    return new Response("Não foi possível consultar a fila da mesa.", { status: 500 });
  }
}
