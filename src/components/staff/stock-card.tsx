import { Package, Warning, Zap } from "@/components/icons/pixel";
import { type KitDemand, poolDemand } from "@/domain/kit-comparison";
import { STOCK_POOL_LABEL } from "@/domain/labels";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { StockPool } from "@/domain/types";
import { EDITION } from "@/domain/edition";
import type { StockOverview, StockPoolView } from "@/server/services/settings";
import { SegmentMeter } from "./panel-ui";

/** Quantos kits faltam para os funcionários que ainda vão receber. */
export function employeeShortfall(pool: StockPoolView) {
  return Math.max(0, (pool.awaiting ?? 0) - pool.available);
}

/** Uma linha curta por estoque em alerta (aviso no topo do placar). */
export function stockAlertText(pool: StockPoolView) {
  const label = STOCK_POOL_LABEL[pool.pool].toLowerCase();
  if (pool.available === 0) return `${label}: esgotado`;
  if (pool.pool === "EMPLOYEE") return `${label}: faltam ${employeeShortfall(pool)} para quem ainda vai receber`;
  return `${label}: restam ${pool.available}`;
}

/** Saldo de kits por estoque, num medidor de segmentos, com alerta de estoque baixo e previsão. */
export function StockCard({
  stock,
  demand,
  waitlist,
}: {
  stock: StockOverview;
  demand?: KitDemand;
  /** Fila do kit (inscrições depois que os kits acabaram), fora da previsão. */
  waitlist?: { member: number; guest: number };
}) {
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
          {/* Quantos kits os inscritos garantem neste estoque (inclui entregues e quem aguarda conferência). */}
          {demand ? (
            <Forecast
              total={pool.total}
              demand={poolDemand(pool.pool, demand, stock.mode)}
              pool={pool.pool}
              waiting={waitlist ? (pool.pool === "ALL" ? waitlist.member + waitlist.guest : pool.pool === "MEMBER" ? waitlist.member : pool.pool === "GUEST" ? waitlist.guest : 0) : 0}
            />
          ) : null}
          {pool.low ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-danger">
              <Warning className="size-3.5 animate-blink" />
              {pool.pool === "EMPLOYEE"
                ? pool.available === 0
                  ? `Esgotado: ${plural(pool.awaiting ?? 0, "kit", "kits")} ainda por sair (colaboradores, convidados deles e cortesias)`
                  : `Faltam ${plural(employeeShortfall(pool), "kit", "kits")} para quem ainda vai receber (colaboradores, convidados deles e cortesias)`
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
      {/* A gordura: estoque separado do oficial para quem se inscreve na hora. */}
      {stock.extra ? (
        <div data-testid="stock-extra">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-bold text-fg">
                <Zap className="size-4 text-[#ffd23f]" /> Gordura (inscrições na hora)
              </p>
              <p className="text-xs text-fg-muted tabular">
                {stock.extra.delivered} entregues de {stock.extra.total} · {plural(stock.extra.committed, "prometido", "prometidos")}
              </p>
            </div>
            <p className={cn("display text-4xl leading-none tabular", stock.extra.low ? "text-red neon-red" : "text-[#ffd23f]")}>
              {stock.extra.available}
              <span className="ml-1.5 font-sans text-xs font-semibold tracking-normal text-fg-muted normal-case [font-stretch:100%]">na caixa</span>
            </p>
          </div>
          <SegmentMeter className="mt-3" value={stock.extra.available} max={stock.extra.total} invert label={`Gordura: ${stock.extra.available} de ${stock.extra.total}`} />
          <p className="mt-2 text-xs text-fg-muted">
            {stock.extra.total} na gordura − {plural(stock.extra.committed, "prometido", "prometidos")} ={" "}
            <strong className="text-fg">{plural(stock.extra.free, "livre", "livres")}</strong> para novas inscrições na hora.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Forecast({ total, demand, pool, waiting = 0 }: { total: number; demand: number; pool: StockPool; waiting?: number }) {
  const short = demand - total;
  return (
    <p
      className={cn("mt-2 text-xs", short > 0 ? "font-bold text-warning" : "text-fg-muted")}
      data-testid={`stock-forecast-${pool.toLowerCase()}`}
      title={
        pool === "EMPLOYEE"
          ? "Colaboradores do SINDSERM liberados (diretoria, funcionários e prestadores), os convidados deles e as cortesias com kit."
          : EDITION.sharedKit
            ? "1 kit por inscrição (o kit é para os dois), contando quem ainda aguarda conferência ou assinatura."
            : "1 kit por pessoa com direito a kit, contando quem ainda aguarda conferência ou assinatura."
      }
    >
      {plural(demand, "kit previsto", "kits previstos")} para {total} cadastrados:{" "}
      {short > 0 ? `faltam ${short} se todos vierem` : `sobram ${total - demand}`}
      {waiting > 0 ? <span className="font-bold text-warning"> · {plural(waiting, "na fila do kit", "na fila do kit")}</span> : null}
    </p>
  );
}
