import { formatTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { TimelineBucket } from "@/server/services/stats";

const LEVELS = 10;

/**
 * Entradas por intervalo de 15 minutos, desenhadas como o equalizador de um
 * aparelho de som dos anos 80 (blocos que acendem de baixo para cima).
 */
export function Equalizer({ buckets, className }: { buckets: TimelineBucket[]; className?: string }) {
  const peak = Math.max(1, ...buckets.map((b) => b.entries));
  const total = buckets.reduce((sum, b) => sum + b.entries, 0);
  const idle = total === 0;
  const labelIndexes = new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1]);

  return (
    <figure className={cn("w-full", className)}>
      <div
        className="relative flex h-40 items-end gap-[3px] rounded-lg border border-line bg-ink p-2"
        role="img"
        aria-label={idle ? "Nenhuma entrada nas últimas horas" : `${total} entradas nas últimas horas, pico de ${peak} em 15 minutos`}
      >
        {buckets.map((bucket) => {
          const level = idle ? 0 : Math.round((bucket.entries / peak) * LEVELS);
          return (
            <div
              key={bucket.start.toISOString()}
              className="flex h-full flex-1 flex-col-reverse gap-[2px]"
              title={`${formatTime(bucket.start)}: ${plural(bucket.entries, "entrada", "entradas")}`}
            >
              {Array.from({ length: LEVELS }, (_, i) => {
                const on = !idle && i < level;
                return (
                  <span
                    key={i}
                    className={cn(
                      "flex-1 rounded-[1px]",
                      !on && "bg-surface-2",
                      on && i >= 8 && "bg-red shadow-[0_0_6px_var(--red)]",
                      on && i >= 5 && i < 8 && "bg-warning",
                      on && i < 5 && "bg-success",
                    )}
                  />
                );
              })}
            </div>
          );
        })}
        {/* Sem entradas: aparelho em espera (nada de barras "de mentira" num placar). */}
        {idle ? (
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
            <span className="pixel animate-blink text-[0.6rem] text-red">Standby</span>
            <span className="text-xs text-fg-muted">Sem entradas nas últimas horas</span>
          </span>
        ) : null}
      </div>
      <figcaption className="mt-2 flex justify-between text-[0.65rem] font-semibold text-fg-dim tabular">
        {buckets.map((bucket, index) =>
          labelIndexes.has(index) ? <span key={bucket.start.toISOString()}>{formatTime(bucket.start)}</span> : null,
        )}
      </figcaption>
    </figure>
  );
}
