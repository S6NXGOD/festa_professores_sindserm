"use client";

import { useNowSeconds } from "@/lib/clock";
import { cn } from "@/lib/utils";

function parts(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Relógio de LED com contagem regressiva até a festa. O título ("A pista abre
 * em") só aparece enquanto conta; na hora, vira o aviso de que começou.
 */
export function Countdown({
  target,
  label,
  doneLabel = "A pista está aberta",
  align = "center",
  className,
}: {
  target: string | Date;
  label?: string;
  doneLabel?: string;
  align?: "center" | "start";
  className?: string;
}) {
  const now = useNowSeconds();
  const targetSeconds = Math.floor(new Date(target).getTime() / 1000);
  const remaining = now === null ? null : targetSeconds - now;

  if (remaining !== null && remaining <= 0) {
    return (
      <p
        className={cn("pixel flex items-center gap-2 text-xs text-red neon-red", align === "center" ? "justify-center" : "justify-start", className)}
        data-testid="countdown-done"
      >
        <span className="size-2 animate-blink rounded-[2px] bg-red shadow-[0_0_8px_var(--red)]" aria-hidden />
        {doneLabel}
        <span className="animate-blink">_</span>
      </p>
    );
  }

  const p = remaining === null ? null : parts(remaining);
  const blocks: { value: string; label: string }[] = [
    { value: p ? String(p.days) : "--", label: "dias" },
    { value: p ? pad(p.hours) : "--", label: "horas" },
    { value: p ? pad(p.minutes) : "--", label: "min" },
    { value: p ? pad(p.seconds) : "--", label: "seg" },
  ];

  return (
    <div className={className}>
      {label ? <p className={cn("pixel mb-3 text-[0.6rem] text-fg-muted", align === "center" && "text-center")}>{label}</p> : null}
      <div className={cn("flex items-end gap-2", align === "center" ? "justify-center" : "justify-start")} role="timer" aria-live="off">
        {blocks.map((block, index) => (
          <div key={block.label} className="flex items-end gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <span className="pixel min-w-[3.1rem] rounded-md border border-red/40 bg-ink px-2 py-2.5 text-center text-base text-red neon-red tabular sm:min-w-[3.6rem] sm:text-lg">
                {block.value}
              </span>
              <span className="text-[0.65rem] font-bold tracking-[0.14em] text-fg-muted uppercase">{block.label}</span>
            </div>
            {index < blocks.length - 1 ? <span className="pixel mb-7 animate-blink text-sm text-red">:</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Contagem compacta até o horário limite dos kits (portaria/painel). */
export function DeadlineTimer({ deadline, className }: { deadline: string | Date; className?: string }) {
  const now = useNowSeconds();
  const remaining = now === null ? null : Math.floor(new Date(deadline).getTime() / 1000) - now;
  if (remaining === null) return <span className={cn("pixel text-[0.6rem] text-fg-muted", className)}>--:--</span>;
  if (remaining <= 0) return <span className={cn("pixel text-[0.6rem] text-danger", className)}>ENCERRADO</span>;
  const { days, hours, minutes, seconds } = parts(remaining);
  const text = days > 0 ? `${days}D ${pad(hours)}H` : hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  return (
    <span className={cn("pixel text-[0.6rem] tabular", remaining < 30 * 60 ? "text-warning" : "text-fg", className)}>
      {text}
    </span>
  );
}
