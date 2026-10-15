import { can } from "@/domain/access";
import { isReportType, REPORT_INFO, reportFileName } from "@/domain/reports";
import { eventStartAt } from "@/domain/kit-deadline";
import { todayInZone } from "@/lib/datetime";
import { capitalizeFirst } from "@/lib/text";
import { db } from "@/server/db";
import { APP_NAME, getConfig, getEventInfo } from "@/server/queries/config";
import { buildReport } from "@/server/reports/build-report";
import { writeAudit } from "@/server/services/audit";
import { DomainError } from "@/server/services/errors";
import { requireActionActor } from "@/server/session";

/*
 * Relatório em PDF de uma área do painel (kits, inscrições, colaboradores,
 * cortesias, fichas, entradas). Quem vê a área baixa o relatório dela; cada
 * relatório gerado fica na auditoria. Tem dados pessoais: nada de cache.
 */

const PRIVATE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, context: RouteContext<"/painel/relatorios/[tipo]">) {
  try {
    const actor = await requireActionActor();
    const { tipo } = await context.params;
    if (!isReportType(tipo)) return new Response("Relatório não encontrado.", { status: 404, headers: PRIVATE });
    const info = REPORT_INFO[tipo];
    if (!can(actor.access, info.permission)) throw new DomainError("FORBIDDEN", "Sem acesso a este relatório.");
    const [config, event] = await Promise.all([getConfig(), getEventInfo()]);
    const pdf = await buildReport(tipo, {
      eventName: config?.name ?? APP_NAME,
      eventLine: event ? `${capitalizeFirst(event.dateLongLabel)} · ${event.timeLabel}` : "",
      kitDeadline: event?.kitDeadline ? { label: event.kitDeadline.label, passed: event.kitDeadline.passed } : null,
      eventStart: config ? eventStartAt(config) : null,
      generatedBy: actor.name,
    });
    await writeAudit(db, actor, {
      action: "REPORT_GENERATED",
      entityType: "event",
      summary: `Relatório em PDF gerado: ${info.title.toLowerCase()}.`,
      after: { report: tipo },
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...PRIVATE,
        "Content-Type": "application/pdf",
        // Abre no navegador (o celular mostra e deixa compartilhar); o nome vale para quem salvar.
        "Content-Disposition": `inline; filename="${reportFileName(tipo, todayInZone())}"`,
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return new Response(error.message, { status: error.code === "UNAUTHENTICATED" ? 401 : error.code === "FORBIDDEN" ? 403 : 400, headers: PRIVATE });
    }
    console.error("Relatório em PDF:", error instanceof Error ? `${error.name}: ${error.message}` : typeof error);
    return new Response("Não foi possível gerar o relatório.", { status: 500, headers: PRIVATE });
  }
}
