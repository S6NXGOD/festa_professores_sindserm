import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  Clock,
  Close,
  Download,
  Keyboard,
  Login,
  type PixelIcon,
  QrCode,
  Search,
  Trophy,
  Undo,
} from "@/components/icons/pixel";
import { PixelTag, PlayerTag } from "@/components/retro/bits";
import { LiveRefresh } from "@/components/retro/live-refresh";
import { CategoryChip } from "@/components/staff/employee-category";
import { ChipFilters, EmptyState, FilterBar, PageHeader, Pagination, Panel, SelectFilter, StatTile } from "@/components/staff/panel-ui";
import { Button } from "@/components/ui/button";
import { eventStartAt } from "@/domain/kit-deadline";
import type { CheckInMethod } from "@/domain/types";
import { formatDayHeading, formatShortDateTime, formatTime, todayInZone, zonedDayKey, zonedHour } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { can } from "@/domain/rules";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { getConfig } from "@/server/queries/config";
import { ENTRY_FILTERS, type EntryFilter, type EntryRow, entryOperators, entrySummary, listEntries } from "@/server/queries/entries";
import { pageNumber } from "@/server/queries/panel";
import { getDashboardStats } from "@/server/services/stats";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Entradas" };

const METHOD: Record<CheckInMethod, { icon: PixelIcon; label: string }> = {
  QR: { icon: QrCode, label: "QR Code" },
  SEARCH: { icon: Search, label: "busca" },
  CODE: { icon: Keyboard, label: "código" },
};

const FILTER_LABEL: Record<EntryFilter, string> = {
  todas: "Todas",
  filiados: "Filiados(as)",
  convidados: "Convidados",
  colaboradores: "Colaboradores",
  estornadas: "Estornadas",
};

/** Quem é a pessoa na festa, numa linha. */
function roleText(row: EntryRow) {
  if (row.role === "GUEST") return `Convidado(a) de ${row.hostName ?? "—"}`;
  if (row.role === "EMPLOYEE") return `Colaborador(a) do SINDSERM${row.employeeJobTitle ? ` · ${row.employeeJobTitle}` : ""}`;
  return row.isTeacher ? "Professor(a)" : "Filiado(a)";
}

function EntryItem({ row, early, canOpen }: { row: EntryRow; early: boolean; canOpen: boolean }) {
  const cancelled = Boolean(row.cancelledAt);
  const method = METHOD[row.method];
  const body = (
    <>
        <span className={cn("pixel w-12 shrink-0 pt-1 text-[0.7rem] tabular", cancelled ? "text-fg-dim line-through" : "text-red")}>
          {formatTime(row.checkedInAt)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("font-bold", cancelled ? "text-fg-muted line-through" : "text-fg")} data-testid="entry-name">
              {row.fullName}
            </span>
            {row.role === "EMPLOYEE" && row.employeeCategory ? (
              <CategoryChip category={row.employeeCategory} />
            ) : (
              <PlayerTag player={row.role === "GUEST" ? 2 : 1} />
            )}
            {early && !cancelled ? <PixelTag tone="warning">Antes do horário</PixelTag> : null}
            {cancelled ? <PixelTag tone="danger">Estornada</PixelTag> : null}
          </div>
          <p className="mt-0.5 text-sm text-fg-muted">
            {roleText(row)}
            {row.kitsAtEntry > 0 && !cancelled ? (
              <span className="font-semibold text-fg"> · {row.kitsAtEntry === 2 ? "2 kits" : "1 kit"} na entrada</span>
            ) : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-dim">
            <method.icon className="size-3.5" />
            {method.label} · registrada por <span className="font-semibold text-fg-muted">{row.byName}</span>
          </p>
          {cancelled ? (
            <p className="mt-1 text-xs text-danger" data-testid="entry-cancelled">
              Estornada por {row.cancelledByName ?? "—"} em {formatShortDateTime(row.cancelledAt)}
              {row.cancelReason ? `: ${row.cancelReason}` : ""}
            </p>
          ) : null}
        </div>
      {canOpen ? <ChevronRight className="mt-1 size-5 shrink-0 text-fg-dim" /> : null}
    </>
  );
  const rowClass = "flex items-start gap-3 px-4 py-3 sm:px-5";
  return (
    <li>
      {/* Só vira link para quem pode abrir o cadastro da pessoa. */}
      {canOpen ? (
        <Link href={`/painel/participantes/${row.personId}`} className={cn(rowClass, "transition-colors hover:bg-white/[0.04]")} data-testid="entry-row">
          {body}
        </Link>
      ) : (
        <div className={rowClass} data-testid="entry-row">
          {body}
        </div>
      )}
    </li>
  );
}

export default async function EntriesPage({ searchParams }: PageProps<"/painel/entradas">) {
  const actor = await requirePageActor("viewEntries");
  const canPeople = can(actor.access, "viewPeople");
  const canEmployees = can(actor.access, "viewEmployees");
  const query = await searchParams;
  const q = typeof query.q === "string" && query.q.trim() ? query.q : undefined;
  const filter = (ENTRY_FILTERS as readonly string[]).includes(String(query.filtro)) ? (query.filtro as EntryFilter) : "todas";
  const operatorParam = typeof query.por === "string" && query.por ? query.por : null;
  const page = pageNumber(query.page);

  const config = await getConfig();
  const eventStart = config ? eventStartAt(config) : null;
  const [summary, operators, list, stats] = await Promise.all([
    entrySummary(eventStart),
    entryOperators(),
    listEntries({ q, filter, operator: operatorParam, page }),
    getDashboardStats(db),
  ]);
  const operator = operators.find((o) => o.userId === operatorParam) ?? null;
  const topOperator = summary.operators[0]?.total ?? 0;
  const today = todayInZone();

  // Agrupa por dia e hora ("Hoje · 19h"): dá para ver o movimento da portaria de relance.
  const groups: { key: string; title: string; rows: EntryRow[] }[] = [];
  for (const row of list.rows) {
    const at = filter === "estornadas" && row.cancelledAt ? row.cancelledAt : row.checkedInAt;
    const day = zonedDayKey(at);
    const key = filter === "estornadas" ? day : `${day}-${zonedHour(at)}`;
    const title = filter === "estornadas" ? formatDayHeading(day, today) : `${formatDayHeading(day, today)} · ${zonedHour(at)}h`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, title, rows: [row] });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Controle de entrada"
        title="Entradas"
        description="Quem entrou, a que horas, quem registrou e como. Estornos também ficam aqui, com o motivo."
        actions={
          <>
            <LiveRefresh score={summary.total} />
            <Button asChild variant="outline">
              <a href="/painel/entradas/planilha" download data-testid="entries-export">
                <Download /> Baixar planilha
              </a>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Entraram"
          value={summary.total}
          icon={Login}
          tone="success"
          hint={stats.expected ? `de ${plural(stats.expected, "esperado", "esperados")}` : undefined}
          testId="entries-total"
        />
        <StatTile
          label="Pelo QR Code"
          value={summary.byMethod.QR}
          icon={QrCode}
          hint={`${summary.byMethod.SEARCH} pela busca · ${summary.byMethod.CODE} pelo código`}
          testId="entries-qr"
        />
        <StatTile
          label="Antes do horário"
          value={summary.early}
          icon={Clock}
          tone="warning"
          hint="Com a confirmação a mais da portaria"
          testId="entries-early"
        />
        <StatTile
          label="Estornadas"
          value={summary.cancelled}
          icon={Undo}
          tone="neutral"
          href="/painel/entradas?filtro=estornadas"
          hint="Com quem estornou e o motivo"
          testId="entries-cancelled"
        />
      </div>

      {summary.operators.length > 0 ? (
        <Panel title="Quem registrou" icon={Trophy} className="mt-4">
          <ol className="grid gap-2 sm:grid-cols-2" data-testid="entries-operators">
            {summary.operators.map((op, index) => (
              <li key={op.userId}>
                <Link
                  href={`/painel/entradas?por=${op.userId}`}
                  className={cn(
                    "relative flex items-center gap-3 overflow-hidden rounded-lg border bg-surface-2 px-3 py-2.5 transition-colors hover:border-red/60",
                    operator?.userId === op.userId ? "border-red" : "border-line",
                  )}
                >
                  {/* Barra de fundo: a parte de cada um no total (placar de fliperama). */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-red/10"
                    style={{ width: `${topOperator ? Math.max(6, Math.round((op.total / topOperator) * 100)) : 0}%` }}
                  />
                  <span className="pixel relative w-6 text-[0.55rem] text-red tabular">{String(index + 1).padStart(2, "0")}</span>
                  <span className="relative min-w-0 flex-1 truncate font-semibold text-fg">{op.name}</span>
                  <span className="display relative text-xl text-fg tabular">{op.total}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <div className="mt-6">
        <ChipFilters
          basePath="/painel/entradas"
          current={filter}
          params={{ q, por: operator?.userId }}
          options={ENTRY_FILTERS.map((value) => ({
            value,
            label: FILTER_LABEL[value],
            count: value === "todas" ? summary.total : value === "estornadas" ? summary.cancelled : undefined,
          }))}
        />
        <FilterBar action="/painel/entradas" q={q} placeholder="Buscar por nome ou CPF">
          <input type="hidden" name="filtro" value={filter} />
          {operators.length > 1 ? (
            <SelectFilter
              name="por"
              value={operator?.userId ?? ""}
              label="Registradas por"
              options={[{ value: "", label: "Toda a portaria" }, ...operators.map((o) => ({ value: o.userId, label: o.name }))]}
            />
          ) : null}
        </FilterBar>
        {operator ? (
          <p className="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-sm text-fg-muted" data-testid="entries-operator-filter">
            Registradas por <span className="font-bold text-fg">{operator.name}</span>
            <Link
              href={filter === "todas" ? "/painel/entradas" : `/painel/entradas?filtro=${filter}`}
              className="inline-flex items-center gap-1 rounded-md border border-line-strong px-2 py-0.5 text-xs font-semibold text-fg-muted hover:text-fg"
            >
              <Close className="size-3" /> tirar filtro
            </Link>
          </p>
        ) : null}

        {list.rows.length === 0 ? (
          <EmptyState icon={Login} title={q || operator || filter !== "todas" ? "Nada encontrado" : "Nenhuma entrada ainda"}>
            {q || operator || filter !== "todas"
              ? "Ajuste a busca ou o filtro."
              : "Cada entrada registrada na portaria aparece aqui na hora, com quem registrou."}
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.key} className="overflow-hidden rounded-xl border border-line bg-surface">
                <header className="flex items-center justify-between gap-3 border-b border-line bg-ink-2/80 px-4 py-2 sm:px-5">
                  <h2 className="pixel text-[0.55rem] text-fg">{group.title}</h2>
                  <span className="pixel text-[0.5rem] text-fg-dim tabular">{plural(group.rows.length, "entrada", "entradas")}</span>
                </header>
                <ul className="divide-y divide-line">
                  {group.rows.map((row) => (
                    <EntryItem
                      key={row.id}
                      row={row}
                      early={Boolean(eventStart && row.checkedInAt < eventStart)}
                      canOpen={canPeople || (canEmployees && (row.role === "EMPLOYEE" || row.hostIsEmployee))}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <Pagination page={list.page} pages={list.pages} basePath="/painel/entradas" params={{ q, filtro: filter === "todas" ? undefined : filter, por: operator?.userId }} />
      </div>
    </div>
  );
}
