"use client";

import { Clock } from "@/components/icons/pixel";
import { useNowSeconds } from "@/lib/clock";
import { cn } from "@/lib/utils";

/** Só nas últimas horas: antes disso, o horário já aparece no início do site. */
const SHOW_FROM_SECONDS = 3 * 3600;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Faixa no formulário de inscrição nas últimas horas: quem está preenchendo vê
 * quanto falta (depois do horário, o servidor recusa o envio).
 */
export function ClosingSoon({ closesAt, label }: { closesAt: string | Date; label: string }) {
  const now = useNowSeconds();
  if (now === null) return null;
  const remaining = Math.floor(new Date(closesAt).getTime() / 1000) - now;
  if (remaining > SHOW_FROM_SECONDS) return null;
  const closed = remaining <= 0;
  const hours = Math.floor(Math.max(remaining, 0) / 3600);
  const minutes = Math.floor((Math.max(remaining, 0) % 3600) / 60);
  const seconds = Math.max(remaining, 0) % 60;

  return (
    <div
      role="status"
      className={cn(
        "mx-auto mb-5 flex max-w-xl items-center gap-3 rounded-xl border-2 px-4 py-3",
        closed ? "border-danger/60 bg-danger-soft" : "border-warning/60 bg-warning-soft",
      )}
      data-testid="closing-soon"
    >
      <Clock className={cn("size-6 shrink-0", closed ? "text-danger" : "animate-wiggle text-warning")} />
      <p className="min-w-0 flex-1 text-sm leading-snug text-fg">
        {closed ? (
          <>
            <strong>As inscrições encerraram às {label}.</strong> Um envio agora não é mais aceito.
          </>
        ) : (
          <>
            <strong>As inscrições fecham às {label}.</strong> Termine antes disso: depois, o envio não é aceito.
          </>
        )}
      </p>
      {closed ? null : (
        <span className="pixel shrink-0 rounded-md border border-warning/50 bg-ink px-2 py-1.5 text-[0.65rem] text-warning tabular">
          {hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`}
        </span>
      )}
    </div>
  );
}
