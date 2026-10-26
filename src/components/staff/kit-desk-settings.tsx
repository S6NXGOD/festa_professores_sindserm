"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Gift, Loader, Login, Package, Save, Zap } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import { EDITION } from "@/domain/edition";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { updateKitDeskSettingsAction } from "@/server/actions/desk";

export interface ExtraNumbers {
  total: number;
  delivered: number;
  committed: number;
  free: number;
}

/**
 * Mesa dos kits e gordura (Kits e estoque): onde o kit sai — na portaria, com a
 * entrada, ou na mesa dos kits, depois dela — e quantos kits a gordura tem para
 * quem se inscreve na hora. A conta da gordura aparece por extenso.
 */
export function KitDeskSettings({
  initial,
  extra,
  canEdit,
}: {
  initial: { kitsAtDesk: boolean; extraTotal: number };
  extra: ExtraNumbers;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [atDesk, setAtDesk] = useState(initial.kitsAtDesk);
  const [total, setTotal] = useState(String(initial.extraTotal));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const typed = Number.parseInt(total || "0", 10);
  const dirty = atDesk !== initial.kitsAtDesk || typed !== initial.extraTotal;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await callAction(updateKitDeskSettingsAction({ kitsAtDesk: atDesk, extraTotal: Number.isFinite(typed) ? typed : -1 }));
      if (!result.ok) {
        playSound("error");
        setError(result.fieldErrors?.extraTotal ?? result.error);
        toast.error(result.error);
        return;
      }
      playSound("powerup");
      toast.success(
        result.data.moved > 0
          ? `Salvo. ${result.data.moved === 1 ? "1 kit de quem se inscreveu na hora passou" : `${result.data.moved} kits de quem se inscreveu na hora passaram`} para a gordura.`
          : "Salvo.",
      );
      if (atDesk !== initial.kitsAtDesk) {
        toast.info("Mudou onde o kit sai: em Usuários, peça o treino de novo para a equipe da porta e da mesa.");
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="kit-desk-settings">
      <fieldset className="space-y-2" disabled={!canEdit || pending}>
        <legend className="text-[0.72rem] font-bold tracking-[0.1em] text-fg-muted uppercase">Onde o kit sai</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {[
            {
              value: false,
              icon: Login,
              title: "Na portaria",
              text: "Junto com a entrada: quem confirma a entrada entrega o kit.",
              testId: "kits-at-gate",
            },
            {
              value: true,
              icon: Package,
              title: "Na mesa dos kits",
              text: EDITION.sharedKit
                ? "A segurança só registra a entrada; a mesa confere quem entrou e entrega. O kit da inscrição é para os dois; convidado de colaborador não espera quem convidou."
                : "A segurança só registra a entrada; a mesa confere quem entrou e entrega. Convidado não espera quem convidou.",
              testId: "kits-at-desk",
            },
          ].map((option) => (
            <button
              key={option.testId}
              type="button"
              role="radio"
              aria-checked={atDesk === option.value}
              onClick={() => setAtDesk(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red disabled:opacity-60",
                atDesk === option.value ? "border-red bg-brand-soft" : "border-line bg-surface-2 hover:border-line-strong",
              )}
              data-testid={option.testId}
            >
              <option.icon className={cn("mt-0.5 size-6 shrink-0", atDesk === option.value ? "text-red" : "text-fg-dim")} />
              <span>
                <span className="block font-bold text-fg">{option.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-fg-muted">{option.text}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="extra-total" className="flex items-center gap-2 text-[0.72rem] font-bold tracking-[0.1em] text-fg-muted uppercase">
          <Zap className="size-4 text-[#ffd23f]" /> Gordura: kits para quem se inscrever na hora
        </label>
        <p className="text-xs leading-snug text-fg-muted">
          Estoque separado do oficial. Depois que as inscrições fecham, cada inscrição feita na hora ganha o voucher amarelo e o kit sai daqui (acabou a
          gordura, vale a regra do oficial).
        </p>
        <Input
          id="extra-total"
          inputMode="numeric"
          value={total}
          onChange={(event) => setTotal(event.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={!canEdit || pending}
          aria-invalid={Boolean(error)}
          className="h-12 max-w-40 text-lg tabular"
          data-testid="extra-total"
        />
        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
        <ExtraMath extra={extra} />
      </div>

      {canEdit ? (
        <Button type="submit" disabled={!dirty || pending} data-testid="kit-desk-save">
          {pending ? <Loader className="animate-spin-steps" /> : <Save />} Salvar
        </Button>
      ) : null}
    </form>
  );
}

/** A conta da gordura por extenso: na caixa − prometidos = livres. */
export function ExtraMath({ extra }: { extra: ExtraNumbers }) {
  const inBox = extra.total - extra.delivered;
  return (
    <div className="space-y-1.5 rounded-xl border border-[#ffd23f]/40 bg-[#ffd23f]/8 p-3 text-sm" data-testid="extra-math">
      {/* A conta em três linhas: na gordura − prometidos = livres. */}
      <div className="grid grid-cols-[1.25rem_auto] gap-x-1.5 gap-y-0.5 font-semibold text-fg">
        <span />
        <span className="tabular">{extra.total} na gordura</span>
        <span className="text-fg-dim">−</span>
        <span className="tabular">{plural(extra.committed, "prometido", "prometidos")} a quem se inscreveu na hora</span>
        <span className="text-fg-dim">=</span>
        <strong className={cn("tabular", extra.free > 0 ? "text-success-text" : "text-warning")}>{plural(extra.free, "livre", "livres")}</strong>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Gift className="size-3.5" /> Já entregues: {extra.delivered} · ainda na caixa: {inBox}
      </p>
    </div>
  );
}
