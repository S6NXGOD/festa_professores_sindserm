import { can } from "@/domain/access";
import { eventStartAt } from "@/domain/kit-deadline";
import { todayInZone } from "@/lib/datetime";
import { getConfig } from "@/server/queries/config";
import { allEntriesForExport, entriesCsv } from "@/server/queries/entries";
import { DomainError } from "@/server/services/errors";
import { requireActionActor } from "@/server/session";

/* Planilha do controle de entrada (todas as entradas, inclusive estornadas). */

export async function GET() {
  try {
    const actor = await requireActionActor();
    if (!can(actor.access, "viewEntries")) throw new DomainError("FORBIDDEN", "Sem acesso ao controle de entrada.");
    const [rows, config] = await Promise.all([allEntriesForExport(), getConfig()]);
    return new Response(entriesCsv(rows, config ? eventStartAt(config) : null), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="entradas-festa-${todayInZone()}.csv"`,
        // Lista de pessoas: nada de cache compartilhado.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return new Response(error.message, { status: error.code === "UNAUTHENTICATED" ? 401 : error.code === "FORBIDDEN" ? 403 : 400 });
    }
    console.error("Planilha de entradas:", error instanceof Error ? error.name : typeof error);
    return new Response("Não foi possível gerar a planilha.", { status: 500 });
  }
}
