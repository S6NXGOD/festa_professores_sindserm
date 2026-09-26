import { Clock, Gift, Package } from "@/components/icons/pixel";
import { DeadlineTimer } from "@/components/retro/countdown";
import type { Metadata } from "next";
import Link from "next/link";
import { StockSettingsForm } from "@/components/settings/settings-forms";
import { EmptyState, PageHeader, Pagination, Panel } from "@/components/staff/panel-ui";
import { StockCard } from "@/components/staff/stock-card";
import { ToneBadge } from "@/components/status/status-badge";
import { KIT_TYPE_LABEL, STOCK_MODE_LABEL } from "@/domain/labels";
import { can } from "@/domain/rules";
import { formatShortDateTime } from "@/lib/datetime";
import { db } from "@/server/db";
import { listDeliveries, pageNumber } from "@/server/queries/panel";
import { getEventInfo } from "@/server/queries/config";
import { getDashboardStats } from "@/server/services/stats";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Kits e estoque" };

export default async function KitsPage({ searchParams }: PageProps<"/painel/kits">) {
  const actor = await requirePageActor("viewKits");
  const canPeople = can(actor.access, "viewPeople");
  const query = await searchParams;
  const page = pageNumber(query.page);
  const [stats, deliveries, event] = await Promise.all([getDashboardStats(db), listDeliveries({ page }), getEventInfo()]);
  const stock = stats.stock;
  const byPool = Object.fromEntries((stock?.pools ?? []).map((p) => [p.pool, p.total]));

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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Saldo" icon={Gift}>
          {stock ? <StockCard stock={stock} demand={stats.kitDemand} /> : null}
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <dt className="text-xs text-fg-muted">Entregues (professoras e professores / convidados{stats.employees ? " / colaboradores" : ""})</dt>
              <dd className="display text-2xl text-fg tabular">
                {stats.kitsDeliveredMember} / {stats.kitsDeliveredGuest}
                {stats.employees ? ` / ${stats.kitsDeliveredEmployee}` : ""}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <dt className="text-xs text-fg-muted">A entregar na entrada (professoras e professores / convidados{stats.employees ? " / colaboradores" : ""})</dt>
              <dd className="display text-2xl text-fg tabular">
                {stats.kitsOwedMember} / {stats.kitsOwedGuest}
                {stats.employees ? ` / ${stats.kitsOwedEmployee}` : ""}
              </dd>
            </div>
          </dl>
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
