import { Clock, Gift, Package } from "@/components/icons/pixel";
import { DeadlineTimer } from "@/components/retro/countdown";
import type { Metadata } from "next";
import Link from "next/link";
import { StockSettingsForm } from "@/components/settings/settings-forms";
import { EmptyState, PageHeader, Pagination, Panel } from "@/components/staff/panel-ui";
import { PeopleKits } from "@/components/staff/people-kits";
import { StockCard } from "@/components/staff/stock-card";
import { ToneBadge } from "@/components/status/status-badge";
import { peopleKitsSummary } from "@/domain/kit-comparison";
import { KIT_TYPE_LABEL, STOCK_MODE_LABEL } from "@/domain/labels";
import { can } from "@/domain/rules";
import { formatShortDateTime } from "@/lib/datetime";
import { db } from "@/server/db";
import { listDeliveries, pageNumber } from "@/server/queries/panel";
import { APP_NAME, getConfig, getEventInfo } from "@/server/queries/config";
import { getDashboardStats, getPeopleKitComparison } from "@/server/services/stats";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Kits e estoque" };

export default async function KitsPage({ searchParams }: PageProps<"/painel/kits">) {
  const actor = await requirePageActor("viewKits");
  const canPeople = can(actor.access, "viewPeople");
  const query = await searchParams;
  const page = pageNumber(query.page);
  const [stats, deliveries, event, comparison, config] = await Promise.all([
    getDashboardStats(db),
    listDeliveries({ page }),
    getEventInfo(),
    getPeopleKitComparison(db),
    getConfig(),
  ]);
  const stock = stats.stock;
  const byPool = Object.fromEntries((stock?.pools ?? []).map((p) => [p.pool, p.total]));
  const pools = (stock?.pools ?? []).map((p) => ({ pool: p.pool, total: p.total }));
  const summary = peopleKitsSummary({ eventName: config?.name ?? APP_NAME, when: formatShortDateTime(new Date()), comparison, pools });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Consumação"
        title="Kits e estoque"
        description={stock ? `${STOCK_MODE_LABEL[stock.mode]} · alerta quando restarem até ${stock.threshold} kits.` : undefined}
        actions={
          event?.kitDeadline ? (
            <span className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-fg">
              <Clock className="size-4 text-red" /> Kits até {event.kitDeadline.label}
              <DeadlineTimer deadline={event.kitDeadline.at} />
            </span>
          ) : null
        }
      />
      {/* Quem vem x quem tem kit, grupo por grupo (substitui os números "entregues / a entregar" separados por barra). */}
      <PeopleKits
        comparison={comparison}
        pools={pools}
        summary={summary}
        links={{ registrations: can(actor.access, "viewRegistrations"), employees: can(actor.access, "viewEmployees") }}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Saldo" icon={Gift}>
          {stock ? <StockCard stock={stock} demand={stats.kitDemand} /> : null}
        </Panel>
        {can(actor.access, "manageSettings") && stock ? (
          <Panel title="Quantidades" icon={Package}>
            <StockSettingsForm
              delivered={{ member: stats.kitsDeliveredMember, guest: stats.kitsDeliveredGuest, employee: stats.kitsDeliveredEmployee }}
              initial={{
                stockMode: stock.mode,
                totalAll: byPool.ALL ?? stats.kitsDeliveredMember + stats.kitsDeliveredGuest,
                totalMember: byPool.MEMBER ?? stats.kitsDeliveredMember,
                totalGuest: byPool.GUEST ?? stats.kitsDeliveredGuest,
                totalEmployee: byPool.EMPLOYEE ?? stats.kitsDeliveredEmployee,
                lowStockThreshold: stock.threshold,
              }}
            />
          </Panel>
        ) : null}
      </div>

      <Panel title="Entregas registradas" icon={Package}>
        {deliveries.rows.length === 0 ? (
          <EmptyState icon={Gift} title="Nenhuma entrega ainda">
            Os kits entregues nas entradas aparecem aqui, com horário e quem registrou.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {deliveries.rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-fg">
                    <Gift className="size-4 text-success-text" />
                    {KIT_TYPE_LABEL[row.kitType]}
                    {row.cancelledAt ? <ToneBadge tone="danger">Estornada</ToneBadge> : null}
                  </p>
                  <p className="text-xs text-fg-muted">
                    Para{" "}
                    {canPeople ? (
                      <Link href={`/painel/participantes/${row.beneficiaryPersonId}`} className="font-semibold text-fg hover:text-red">
                        {row.beneficiaryName}
                      </Link>
                    ) : (
                      <span className="font-semibold text-fg">{row.beneficiaryName}</span>
                    )}
                    {row.kitType === "EMPLOYEE" ? " · colaborador(a) do SINDSERM" : null}
                    {row.kitType === "GUEST" ? (
                      <>
                        {" "}
                        · convidado(a) de{" "}
                        {canPeople ? (
                          <Link href={`/painel/participantes/${row.memberPersonId}`} className="font-semibold text-fg hover:text-red">
                            {row.memberName}
                          </Link>
                        ) : (
                          <span className="font-semibold text-fg">{row.memberName}</span>
                        )}
                        {row.employeeGroup ? " (colaborador(a), estoque dos colaboradores)" : null}
                      </>
                    ) : null}
                    {row.cancelReason ? ` · motivo do estorno: ${row.cancelReason}` : ""}
                  </p>
                </div>
                <span className="text-xs text-fg-muted tabular">
                  {formatShortDateTime(row.deliveredAt)} · {row.deliveredBy}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={deliveries.page} pages={deliveries.pages} basePath="/painel/kits" params={{}} />
      </Panel>
    </div>
  );
}
