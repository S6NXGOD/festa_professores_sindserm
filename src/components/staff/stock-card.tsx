import { Package, Warning } from "@/components/icons/pixel";
import { STOCK_POOL_LABEL } from "@/domain/labels";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { StockPool } from "@/domain/types";
import type { StockOverview, StockPoolView } from "@/server/services/settings";
import { SegmentMeter } from "./panel-ui";

/** Quantos kits os inscritos garantem em cada estoque (inclui entregues e quem aguarda conferência). */
function demandFor(pool: StockPool, demand: StockDemand) {
  if (pool === "ALL") return demand.member + demand.guest;
  if (pool === "EMPLOYEE") return demand.employee ?? 0;
  return pool === "MEMBER" ? demand.member : demand.guest;
}

interface StockDemand {
  member: number;
  guest: number;
  employee?: number;
}

/** Quantos kits faltam para os funcionários que ainda vão receber. */
export function employeeShortfall(pool: StockPoolView) {
  return Math.max(0, (pool.awaiting ?? 0) - pool.available);
}

/** Uma linha curta por estoque em alerta (aviso no topo do placar). */
export function stockAlertText(pool: StockPoolView) {
  const label = STOCK_POOL_LABEL[pool.pool].toLowerCase();
  if (pool.available === 0) return `${label}: esgotado`;
  if (pool.pool === "EMPLOYEE") return `${label}: faltam ${employeeShortfall(pool)} para colaboradores e convidados deles`;
  return `${label}: restam ${pool.available}`;
}

/** Saldo de kits por estoque, num medidor de segmentos, com alerta de estoque baixo e previsão. */
export function StockCard({ stock, demand }: { stock: StockOverview; demand?: StockDemand }) {
  return (
    <div className="space-y-5">
      {stock.pools.map((pool) => (
        <div key={pool.pool} data-testid={`stock-${pool.pool.toLowerCase()}`}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-fg">{STOCK_POOL_LABEL[pool.pool]}</p>
              <p className="text-xs text-fg-muted tabular">
                {pool.delivered} entregues de {pool.total}
              </p>
            </div>
            <p className={cn("display text-4xl leading-none tabular", pool.low ? "text-red neon-red" : "text-fg")}>
              {pool.available}
              <span className="ml-1.5 font-sans text-xs font-semibold tracking-normal text-fg-muted normal-case [font-stretch:100%]">
                no estoque
              </span>
            </p>
          </div>
          <SegmentMeter className="mt-3" value={pool.available} max={pool.total} invert label={`Estoque disponível: ${pool.available} de ${pool.total}`} />
          {demand ? <Forecast total={pool.total} demand={demandFor(pool.pool, demand)} pool={pool.pool} /> : null}
          {pool.low ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-danger">
              <Warning className="size-3.5 animate-blink" />
              {pool.pool === "EMPLOYEE"
                ? pool.available === 0
                  ? `Esgotado: ${plural(pool.awaiting ?? 0, "kit", "kits")} ainda por sair (colaboradores e convidados)`
                  : `Faltam ${plural(employeeShortfall(pool), "kit", "kits")} para colaboradores e convidados deles`
                : pool.available === 0
                  ? "Estoque esgotado"
                  : `Estoque baixo (alerta em ${stock.threshold})`}
            </p>
          ) : null}
        </div>
      ))}
      {stock.pools.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Package className="size-4" /> Estoque não configurado.
        </p>
      ) : null}
    </div>
  );
}

function Forecast({ total, demand, pool }: { total: number; demand: number; pool: StockPool }) {
  const short = demand - total;
  return (
    <p
      className={cn("mt-2 text-xs", short > 0 ? "font-bold text-warning" : "text-fg-muted")}
      data-testid={`stock-forecast-${pool.toLowerCase()}`}
      title={
        pool === "EMPLOYEE"
          ? "Colaboradores do SINDSERM liberados (diretoria, funcionários e prestadores) e os convidados deles."
          : "Professoras e professores inscritos e seus convidados, contando quem ainda aguarda conferência ou assinatura."
      }
    >
      {pool === "EMPLOYEE" ? "Colaboradores + convidados" : "Previsão com os inscritos"}: {plural(demand, "kit", "kits")} ·{" "}
      {short > 0 ? `faltam ${short} se todos vierem` : `sobram ${total - demand}`}
    </p>
  );
}
