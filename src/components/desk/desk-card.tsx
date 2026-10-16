"use client";

import { motion } from "motion/react";
import { WalkInStamp } from "@/components/gate/walk-in-stamp";
import { Check, CheckDouble, DoorClosed, Gift, Hourglass, Info, Loader, Login, Package, Warning } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { DeskView } from "@/server/services/desk";

/**
 * Cartão da mesa dos kits: em cima, se a pessoa foi validada na entrada; no
 * meio, quem é (nome, CPF e código do voucher para conferir); embaixo, o kit e
 * a caixa de onde ele sai. Componente puro: a mesa de verdade e o treino usam o mesmo.
 */
export function DeskCard({
  view,
  onDeliver,
  onLeftover,
  onNext,
  delivering = false,
  justDelivered = null,
  className,
}: {
  view: DeskView;
  onDeliver?: () => void;
  /** Na fila do kit, antes do horário: a equipe pode entregar um kit de sobra. */
  onLeftover?: () => void;
  /** Fechar e atender a próxima pessoa. */
  onNext?: () => void;
  delivering?: boolean;
  /** Acabou de entregar: a festa na tela e quantos restam na caixa. */
  justDelivered?: { available: number; extra: boolean; low: boolean } | null;
  className?: string;
}) {
  const kit = view.kit;
  const entered = Boolean(view.entry);
  const band = justDelivered
    ? { tone: "bg-success text-success-foreground", icon: CheckDouble, kicker: "Feito!", title: "KIT ENTREGUE", detail: "Baixa no estoque e no sistema: não sai de novo." }
    : !entered
      ? {
          tone: "bg-danger text-white",
          icon: DoorClosed,
          kicker: "Stop",
          title: "AINDA NÃO PASSOU PELA ENTRADA",
          detail: "Mande para a segurança registrar a entrada. Depois a pessoa volta aqui.",
        }
      : kit.kind === "DELIVERED"
        ? {
            tone: "bg-warning text-warning-foreground",
            icon: Warning,
            kicker: "Já pegou",
            title: "KIT JÁ ENTREGUE",
            detail: `Às ${formatTime(kit.at)}, por ${kit.byName}. Não entregue de novo.`,
          }
        : {
            tone: "bg-success text-success-foreground",
            icon: Login,
            kicker: "Ready",
            title: "VALIDADA NA ENTRADA",
            detail: view.entry ? `Entrou às ${formatTime(view.entry.at)} · registrado por ${view.entry.byName}` : undefined,
          };

  return (
    <div
      className={cn("overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_24px_60px_-28px_rgb(0_0_0/0.95)]", className)}
      data-testid="desk-card"
      data-kit={justDelivered ? "done" : kit.kind}
    >
      <motion.div
        key={band.title}
        initial={{ opacity: 0.4, scaleY: 0.85 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn("relative origin-top px-4 py-3.5", band.tone)}
        role="status"
        aria-live="assertive"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-black/15">
            <band.icon className="size-7" />
          </span>
          <div className="min-w-0">
            <p className="pixel text-[0.5rem] opacity-80">{band.kicker}</p>
            <p className="display mt-0.5 text-[1.6rem] leading-[0.92] min-[400px]:text-[1.85rem]" data-testid="desk-status-title">
              {band.title}
            </p>
          </div>
        </div>
        {band.detail ? <p className="mt-2 text-sm font-bold opacity-95">{band.detail}</p> : null}
        {justDelivered ? (
          <motion.span
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], y: -36 }}
            transition={{ duration: 1.3 }}
            className="pixel pointer-events-none absolute top-4 right-5 text-lg"
            aria-hidden
          >
            +1
          </motion.span>
        ) : null}
      </motion.div>

      <div className="space-y-3 p-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {view.walkIn ? <WalkInStamp size="lg" /> : null}
            {view.isMinor ? (
              <span className="pixel inline-flex items-center gap-1 rounded-[4px] bg-warning px-1.5 py-1 text-[0.5rem] text-warning-foreground">
                <Warning className="size-3" /> Menor de 18
              </span>
            ) : null}
          </div>
          <p className="display text-[2.1rem] leading-[0.95] break-words text-fg" data-testid="desk-person-name">
            {view.fullName}
          </p>
          <p className="mt-1.5 text-[0.95rem] font-semibold text-fg-muted">{view.roleLabel}</p>
          {/* Para conferir com o documento ou o voucher que a pessoa mostra. */}
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-dashed border-line-strong bg-ink/40 p-3" data-testid="desk-check">
            <div className="min-w-0">
              <p className="text-[0.62rem] font-bold tracking-[0.1em] text-fg-dim uppercase">CPF</p>
              <p className="mt-0.5 truncate font-mono text-sm text-fg">{view.cpf}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[0.62rem] font-bold tracking-[0.1em] text-fg-dim uppercase">Voucher</p>
              <p className="mt-0.5 truncate font-mono text-sm text-fg" data-testid="desk-voucher-code">
                {view.voucherCode ?? "—"}
              </p>
            </div>
          </div>
        </div>

        {justDelivered ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/50 bg-success-soft px-3.5 py-3" data-testid="desk-delivered">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-success text-white">
              <Check className="size-7" />
            </span>
            <p className="text-sm font-semibold text-fg">
              {justDelivered.extra ? "Saiu da caixa da gordura." : "Saiu da caixa oficial."}{" "}
              <span className={cn(justDelivered.low ? "font-bold text-warning" : "text-fg-muted")}>
                Restam {justDelivered.available} {justDelivered.extra ? "na gordura" : "nessa caixa"}.
              </span>
            </p>
          </div>
        ) : entered ? (
          <KitTile view={view} />
        ) : null}

        {!justDelivered && entered && kit.kind === "READY" && onDeliver ? (
          <Button
            type="button"
            variant="success"
            size="xl"
            className="h-auto min-h-16 w-full flex-col gap-1 py-2.5"
            onClick={onDeliver}
            disabled={delivering}
            data-testid="desk-deliver"
          >
            <span className="flex items-center gap-2.5 text-xl leading-none min-[400px]:text-2xl">
              {delivering ? <Loader className="animate-spin-steps" /> : <Gift />}
              {kit.extra ? "Entregar kit da gordura" : "Entregar kit"}
            </span>
            <span className="pixel text-[0.5rem] leading-none opacity-90">Conferi nome, CPF ou voucher</span>
          </Button>
        ) : null}

        {!justDelivered && entered && kit.kind === "BLOCKED" && kit.leftover && onLeftover ? (
          <Button type="button" variant="outline" className="w-full" onClick={onLeftover} disabled={delivering} data-testid="desk-leftover">
            <Gift /> Entregar kit de sobra (a organização liberou)
          </Button>
        ) : null}

        {onNext ? (
          <Button type="button" variant={justDelivered || kit.kind !== "READY" || !entered ? "light" : "ghost"} className="w-full" onClick={onNext} data-testid="desk-next">
            Próxima pessoa
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** O kit da pessoa: entregar (e de qual caixa) ou por que não sai. */
function KitTile({ view }: { view: DeskView }) {
  const kit = view.kit;
  if (kit.kind === "READY") {
    return (
      <div
        className={cn(
          "flex items-center gap-3.5 rounded-xl border px-3.5 py-3",
          kit.extra ? "border-[#ffd23f]/70 bg-[#ffd23f]/12" : "border-red/60 bg-brand-soft",
        )}
        data-testid="desk-kit"
        data-pool={kit.extra ? "extra" : "official"}
      >
        <span
          className={cn(
            "inline-flex size-12 shrink-0 items-center justify-center rounded-lg shadow-[0_3px_0_0_rgb(0_0_0/0.4)]",
            kit.extra ? "bg-[#ffd23f] text-[#1a1033]" : "bg-red text-white",
          )}
        >
          <Package className="size-7" />
        </span>
        <div className="min-w-0">
          <p className={cn("pixel text-[0.5rem]", kit.extra ? "text-[#ffd23f]" : "text-red")}>
            {kit.extra ? "Caixa da gordura" : "Caixa oficial"}
          </p>
          <p className="display mt-0.5 text-[1.65rem] leading-none text-fg">Entregue 1 kit</p>
          <p className="mt-1 text-sm leading-snug text-fg-muted">
            {kit.extra ? "Inscrição na hora: pegue o kit da gordura." : kit.kitType === "GUEST" ? "Kit de convidado(a)." : "O kit da pessoa."}
          </p>
          {kit.minor ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-warning px-2 py-1 text-xs font-bold text-warning-foreground" data-testid="desk-minor-kit">
              <Warning className="size-3.5 shrink-0" /> Kit de menor de 18
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  if (kit.kind === "DELIVERED") return null;
  const waiting = kit.kind === "BLOCKED" && kit.code === "KIT_WAITLIST";
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-3" data-testid="desk-kit" data-pool="none">
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-muted">
        {waiting ? <Hourglass className="size-7" /> : <Info className="size-7" />}
      </span>
      <div className="min-w-0">
        <p className="pixel text-[0.5rem] text-fg-dim">Kit</p>
        <p className="display mt-0.5 text-[1.65rem] leading-none text-fg">{waiting ? "Na fila do kit" : "Sem kit agora"}</p>
        {kit.kind === "BLOCKED" ? <p className="mt-1 text-sm leading-snug text-fg-muted">{kit.message}</p> : null}
      </div>
    </div>
  );
}
