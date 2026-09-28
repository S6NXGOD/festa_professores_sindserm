import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown, Database } from "@/components/icons/pixel";
import { auditActionLabel } from "@/components/staff/audit-timeline";
import { EmptyState, FilterBar, PageHeader, Pagination, SelectFilter } from "@/components/staff/panel-ui";
import { type AccessMap, can } from "@/domain/access";
import { formatDateTime } from "@/lib/datetime";
import { listAuditEntries, pageNumber } from "@/server/queries/panel";
import { AUDIT_ACTIONS } from "@/server/services/audit";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Auditoria" };

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="text-[0.68rem] font-bold tracking-[0.1em] text-fg-dim uppercase">{label}</p>
      <pre className="mt-1 max-h-60 overflow-auto rounded-lg border border-line bg-ink p-3 font-mono text-xs whitespace-pre-wrap text-fg-muted">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/**
 * De onde o registro veio, para conferir na hora (ex.: a inscrição confirmada abre
 * o cadastro com "Confirmada em ... por ..."). Só para quem pode abrir a tela de destino.
 */
function entityLink(row: { entityType: string; entityId: string | null }, access: AccessMap) {
  if (!row.entityId) return null;
  if (row.entityType === "registration" && can(access, "viewRegistrations")) return { href: `/painel/inscricoes/${row.entityId}`, label: "Abrir cadastro" };
  if (row.entityType === "person" && can(access, "viewPeople")) return { href: `/painel/participantes/${row.entityId}`, label: "Abrir cadastro" };
  if (row.entityType === "affiliation_form" && can(access, "viewForms")) return { href: `/painel/filiacoes/${row.entityId}`, label: "Abrir ficha" };
  return null;
}

export default async function AuditPage({ searchParams }: PageProps<"/painel/auditoria">) {
  const actor = await requirePageActor("viewAudit");
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : undefined;
  const actionParam = typeof query.acao === "string" ? query.acao : "";
  const action = Object.hasOwn(AUDIT_ACTIONS, actionParam) ? actionParam : null;
  const page = pageNumber(query.page);
  const data = await listAuditEntries({ page, action, q });

  return (
    <div>
      <PageHeader eyebrow="Caixa-preta" title="Auditoria" description="Operações sensíveis: quem fez, o quê e quando (com antes e depois)." />
      <FilterBar action="/painel/auditoria" q={q} placeholder="Buscar no resumo ou pelo operador">
        <SelectFilter
          name="acao"
          value={action ?? ""}
          label="Ação"
          options={[{ value: "", label: "Todas as ações" }, ...Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label }))]}
        />
      </FilterBar>
      {data.rows.length === 0 ? (
        <EmptyState icon={Database} title="Nenhum registro">
          As operações sensíveis aparecem aqui.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {data.rows.map((row) => {
            const link = entityLink(row, actor.access);
            return (
              <li key={row.id} className="rounded-xl border border-line bg-surface">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-fg">{auditActionLabel(row.action)}</p>
                      <p className="text-sm text-fg-muted">{row.summary}</p>
                      {link ? (
                        <Link
                          href={link.href}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-red hover:underline"
                          data-testid="audit-open"
                        >
                          {link.label} <ArrowRight className="size-3.5" />
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-start justify-between gap-3">
                      <p className="text-xs text-fg-dim tabular sm:text-right">
                        {formatDateTime(row.createdAt)}
                        <br />
                        {row.actorLabel}
                      </p>
                      {row.before || row.after ? <ChevronDown className="size-4 text-fg-dim transition-transform group-open:rotate-180" /> : null}
                    </div>
                  </summary>
                  {row.before || row.after ? (
                    <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
                      <JsonBlock label="Antes" value={row.before} />
                      <JsonBlock label="Depois" value={row.after} />
                    </div>
                  ) : null}
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={data.page} pages={data.pages} basePath="/painel/auditoria" params={{ q, acao: action ?? undefined }} />
    </div>
  );
}
