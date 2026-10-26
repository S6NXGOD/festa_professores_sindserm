"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Package, Users, Warning } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { type KitDemand, stockBalance } from "@/domain/kit-comparison";
import type { StockMode, StockPool } from "@/domain/types";
import { callAction } from "@/lib/call-action";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { updateStockSettingsAction } from "@/server/actions/setup";
import { EDITION, T } from "@/domain/edition";

/** Nome curto de cada estoque e para quem ele é. */
function poolInfo(pool: StockPool, mode?: StockMode): { name: string; audience: string } {
  if (pool === "ALL") {
    return mode === "UNIFIED"
      ? {
          name: "Estoque único",
          audience: EDITION.sharedKit
            ? `Todo mundo: ${T.peopleList} (1 kit por inscrição, para os dois), colaboradores, convidados deles e cortesias`
            : `Todo mundo: ${T.peopleList}, convidados, colaboradores e cortesias`,
        }
      : {
          name: "Estoque geral",
          audience: EDITION.sharedKit ? `${T.PeopleList}: 1 kit por inscrição, para os dois` : `${T.PeopleList} e os convidados delas e deles`,
        };
  }
  if (pool === "MEMBER") return { name: `Estoque de ${T.person}`, audience: T.People };
  if (pool === "GUEST") return { name: "Estoque de convidado", audience: `Convidados ${T.ofPeople}` };
  return { name: "Estoque dos colaboradores", audience: "Colaboradores do SINDSERM, convidados deles e cortesias" };
}

/** "550 − 562 = faltam 12", com o nome de cada número embaixo. */
function Equation({ total, planned, big = false, testId }: { total: number; planned: number; big?: boolean; testId?: string }) {
  const balance = total - planned;
  const number = cn("display leading-none tabular", big ? "text-[1.75rem] sm:text-4xl" : "text-[1.5rem] sm:text-3xl");
  const label = "mt-1 text-[0.55rem] font-bold tracking-normal text-fg-dim uppercase sm:text-[0.6rem] sm:tracking-[0.08em]";
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-2 sm:gap-x-3" data-testid={testId}>
      <span className="flex flex-col items-center">
        <span className={cn(number, "text-fg")}>{total.toLocaleString("pt-BR")}</span>
        <span className={label}>cadastrados</span>
      </span>
      <span className={cn(number, "text-fg-dim")} aria-label="menos">
        −
      </span>
      <span className="flex flex-col items-center">
        <span className={cn(number, "text-fg")}>{planned.toLocaleString("pt-BR")}</span>
        <span className={label}>previstos</span>
      </span>
      <span className={cn(number, "text-fg-dim")} aria-label="igual a">
        =
      </span>
      <span
        className={cn(
          "pixel mt-0.5 inline-flex items-center rounded-md px-2 py-1.5 text-[0.6rem] leading-none whitespace-nowrap",
          balance < 0 ? "bg-danger text-white" : "bg-success text-success-foreground",
        )}
      >
        {balance < 0 ? `faltam ${(-balance).toLocaleString("pt-BR")}` : `sobram ${balance.toLocaleString("pt-BR")}`}
      </span>
    </div>
  );
}

/**
 * A conta dos kits, sem mistério: kits cadastrados menos kits previstos,
 * estoque por estoque, e a soma. Quando falta num estoque e sobra no outro, um
 * toque junta os estoques (para quem pode mexer nas quantidades).
 */
export function StockMath({
  pools,
  demand,
  mode,
  waitlist = 0,
  threshold = 0,
  canUnify = false,
}: {
  pools: { pool: StockPool; total: number }[];
  demand: KitDemand;
  mode?: StockMode;
  /** Quantos esperam na fila do kit (fora da conta: ganham kit se sobrar). */
  waitlist?: number;
  /** Limite de alerta atual (mantido ao juntar os estoques). */
  threshold?: number;
  /** Pode juntar os estoques (Configurações: editar). */
  canUnify?: boolean;
}) {
  const router = useRouter();
  const promoted = useRef(0);
  const balances = stockBalance(pools, demand, mode);
  const stockTotal = pools.reduce((sum, pool) => sum + pool.total, 0);
  const planned = demand.member + demand.guest + (demand.employee ?? 0);
  const short = balances.filter((b) => b.balance < 0);
  // Falta num estoque e sobra no outro: somando, dá para todos (o estoque único resolve).
  const unifyHelps = mode !== "UNIFIED" && short.length > 0 && stockTotal - planned >= 0;

  if (pools.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted" data-testid="stock-math">
        <Package className="size-4 shrink-0" /> Estoque ainda não cadastrado: {plural(planned, "kit previsto", "kits previstos")}.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-line-strong bg-ink/60 p-3.5 sm:p-4" data-testid="stock-math">
      <p className="pixel text-[0.55rem] text-red">A conta dos kits</p>
      <ul className="mt-3 grid gap-3">
        {balances.map((balance) => {
          const info = poolInfo(balance.pool, mode);
          return (
            <li
              key={balance.pool}
              className="flex flex-col gap-2.5 border-t border-line/70 pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`stock-math-${balance.pool.toLowerCase()}`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold text-fg">
                  {balance.pool === "EMPLOYEE" ? <Users className="size-4 text-warning" /> : <Package className="size-4 text-red" />}
                  {info.name}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-fg-muted">{info.audience}</p>
              </div>
              <Equation total={balance.total} planned={balance.planned} />
            </li>
          );
        })}
        {balances.length > 1 ? (
          <li
            className="flex flex-col gap-2.5 rounded-lg border border-red/40 bg-brand-soft px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid="stock-math-total"
          >
            <div className="min-w-0">
              <p className="display text-xl leading-none text-fg">Somando os estoques</p>
              <p className="mt-1 text-xs text-fg-muted">Se tudo fosse um estoque só</p>
            </div>
            <Equation total={stockTotal} planned={planned} big />
          </li>
        ) : null}
      </ul>

      {unifyHelps ? (
        <div className="mt-3 rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm text-fg" data-testid="unify-hint">
          <p className="flex items-start gap-2">
            <Warning className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Os estoques estão separados: <strong>falta kit em um e sobra no outro</strong>. Juntando, os{" "}
              {stockTotal.toLocaleString("pt-BR")} kits atendem os {planned.toLocaleString("pt-BR")} previstos
              {waitlist ? " e a fila do kit anda sozinha" : ""}.
            </span>
          </p>
          {canUnify ? (
            <ConfirmActionDialog
              trigger={
                <Button className="mt-3 w-full sm:w-auto" data-testid="unify-stock">
                  <Package /> Juntar os estoques ({stockTotal.toLocaleString("pt-BR")} para todos)
                </Button>
              }
              title="Juntar os estoques?"
              description={`Os ${stockTotal.toLocaleString("pt-BR")} kits passam a valer para todo mundo: ${T.peopleList}, convidados, colaboradores e cortesias. Dá para separar de novo em Quantidades, quando quiser.`}
              confirmLabel="Juntar os estoques"
              tone="success"
              sound="powerup"
              onConfirm={async () => {
                const result = await callAction(
                  updateStockSettingsAction({ stockMode: "UNIFIED", totalAll: stockTotal, lowStockThreshold: threshold }),
                );
                if (result.ok) promoted.current = result.data.promoted;
                return result;
              }}
              onDone={() => {
                toast.success(
                  `Pronto: ${stockTotal.toLocaleString("pt-BR")} kits para todos.${
                    promoted.current ? ` ${promoted.current === 1 ? "1 kit saiu" : `${promoted.current} kits saíram`} da fila do kit.` : ""
                  }`,
                );
                router.refresh();
              }}
            />
          ) : (
            <p className="mt-2 text-xs text-fg-muted">Quem cuida das Configurações junta em Kits e estoque → Quantidades.</p>
          )}
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-fg-muted">
        <strong className="text-fg">Cadastrados</strong>: os kits que vocês têm, contando os que já saíram.{" "}
        <strong className="text-fg">Previstos</strong>:{" "}
        {EDITION.sharedKit
          ? "1 por inscrição (o kit é para os dois: o convidado não tem kit próprio) e 1 por colaborador(a), convidado dele(a) e cortesia com kit, inclusive quem ainda aguarda conferência."
          : "1 por pessoa com direito a kit, inclusive quem ainda aguarda conferência."}
        {waitlist
          ? ` A fila do kit (${plural(waitlist, "kit", "kits")}) fica fora da conta: ganha kit se vagar ou se sobrar na festa.`
          : ""}
      </p>
    </div>
  );
}
