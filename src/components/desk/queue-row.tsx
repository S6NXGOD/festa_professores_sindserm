"use client";

import { AnimatePresence, motion } from "motion/react";
import { WalkInStamp } from "@/components/gate/walk-in-stamp";
import { ChevronRight, Gift, Loader, Package, Warning } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/datetime";
import { firstName } from "@/lib/text";
import { cn } from "@/lib/utils";

/** Uma pessoa na fila da mesa (quem passou pela entrada e ainda não pegou o kit). */
export interface DeskQueueRow {
  personId: string;
  fullName: string;
  isMinor: boolean;
  checkedInAt: string;
  checkedInByName: string;
  roleLabel: string;
  /** Kit da gordura (inscrição na hora). */
  extra: boolean;
  /** Na fila do kit. */
  waitlisted: boolean;
  voucherCode: string | null;
  /** Dá para entregar direto da lista. */
  quick: boolean;
}

/**
 * Linha da fila da mesa. Tocar no nome abre o cartão completo. O botão
 * Entregar abre a confirmação ali mesmo (nome e código do voucher para
 * conferir) e o segundo toque entrega. No lugar do Entregar entra o Cancelar:
 * um toque duplo sem querer não entrega nada.
 */
export function DeskQueueItemRow({
  item,
  isNew = false,
  minorKit = false,
  confirming = false,
  busy = false,
  opening = false,
  onOpen,
  onQuick,
  onCancel,
  onConfirm,
  right,
}: {
  item: DeskQueueRow;
  /** Acabou de passar pela segurança (destaque por alguns segundos). */
  isNew?: boolean;
  /** A montagem tem kit de menor de 18. */
  minorKit?: boolean;
  confirming?: boolean;
  busy?: boolean;
  opening?: boolean;
  onOpen: () => void;
  onQuick: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** Treino: marca a pessoa certa (para os testes). */
  right?: boolean;
}) {
  const yellow = item.extra;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-surface transition-[border-color,box-shadow] duration-700",
        isNew
          ? "border-success shadow-[0_0_0_2px_rgb(34_197_94/0.35),0_0_28px_-6px_rgb(34_197_94/0.7)]"
          : confirming
            ? "border-success/70"
            : yellow
              ? "border-[#ffd23f]/50"
              : "border-line",
      )}
      data-testid="desk-queue-item"
      data-new={isNew ? "true" : undefined}
      data-right={right === undefined ? undefined : right ? "true" : "false"}
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left outline-none hover:bg-white/3 focus-visible:ring-[3px] focus-visible:ring-red/50 focus-visible:ring-inset"
          data-testid="desk-queue-open"
        >
          {isNew ? (
            <span className="pixel w-12 shrink-0 animate-pulse text-center text-[0.55rem] text-success-text" data-testid="desk-queue-new">
              Chegou
            </span>
          ) : (
            <span className="pixel w-12 shrink-0 text-center text-[0.6rem] text-fg-dim tabular">{formatTime(new Date(item.checkedInAt))}</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-fg">{item.fullName}</span>
            <span className="block truncate text-xs text-fg-muted">{item.roleLabel}</span>
          </span>
          {yellow && !item.quick ? <WalkInStamp className="hidden min-[420px]:inline-flex" /> : null}
          {item.waitlisted && !item.quick ? <span className="pixel rounded bg-surface-3 px-1.5 py-1 text-[0.5rem] text-fg-muted">Fila</span> : null}
          {item.quick ? null : <ChevronRight className={cn("size-5 shrink-0 text-fg-dim", opening && "animate-pulse")} />}
        </button>
        {item.quick ? (
          confirming ? (
            <button
              type="button"
              onClick={onCancel}
              className="mr-2 inline-flex h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-fg-muted outline-none hover:bg-white/6 hover:text-fg focus-visible:ring-2 focus-visible:ring-red"
              data-testid="desk-quick-cancel"
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              onClick={onQuick}
              className={cn(
                "mr-2 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-bold shadow-[0_3px_0_0_rgb(0_0_0/0.45)] outline-none transition-transform active:translate-y-[2px] active:shadow-none focus-visible:ring-2 focus-visible:ring-red",
                yellow ? "bg-[#ffd23f] text-[#1a1033]" : "bg-success text-success-foreground",
              )}
              aria-label={`Entregar o kit a ${item.fullName}`}
              data-testid="desk-quick-deliver"
            >
              <Gift className="size-4" /> Entregar
            </button>
          )
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {confirming ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-line px-3 pt-2.5 pb-3" data-testid="desk-quick-confirm-box">
              <p className="text-xs font-bold tracking-[0.08em] text-fg-dim uppercase">Confira com o voucher ou o documento</p>
              <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <strong className="text-fg">{item.fullName}</strong>
                <span className="font-mono text-sm text-fg">{item.voucherCode ?? "sem voucher"}</span>
              </p>
              {yellow ? (
                <p className="flex items-center gap-1.5 text-xs font-bold text-[#ffd23f]">
                  <Package className="size-4" /> Kit da caixa da gordura (inscrição na hora)
                </p>
              ) : null}
              {item.isMinor && minorKit ? (
                <p className="flex items-center gap-1.5 text-xs font-bold text-warning">
                  <Warning className="size-4" /> Menor de 18: entregue o kit de menor
                </p>
              ) : null}
              <Button
                type="button"
                variant="success"
                size="lg"
                className={cn("w-full", yellow && "bg-[#ffd23f] text-[#1a1033] [--arcade-edge:#8a6d00]")}
                disabled={busy}
                onClick={onConfirm}
                data-testid="desk-quick-confirm"
              >
                {busy ? <Loader className="animate-spin-steps" /> : <Gift />} {yellow ? "Entregar o kit da gordura" : "Entregar o kit"} a {firstName(item.fullName)}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
