import type { PixelIcon } from "@/components/icons/pixel";
import { cn } from "@/lib/utils";

export type Tone = "red" | "success" | "warning" | "danger" | "neutral";

const LED_TONE: Record<Tone, string> = {
  red: "bg-red shadow-[0_0_8px_var(--red)]",
  success: "bg-success shadow-[0_0_8px_var(--success)]",
  warning: "bg-warning shadow-[0_0_8px_var(--warning)]",
  danger: "bg-danger shadow-[0_0_8px_var(--danger)]",
  neutral: "bg-fg-dim",
};

/** LED de aparelho de som (indicador de estado). */
export function Led({ tone = "red", blink = false, className }: { tone?: Tone; blink?: boolean; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-[2px]", LED_TONE[tone], blink && "animate-blink", className)} />;
}

/** Etiqueta de fliperama ("PLAYER 1", "SCORE"...). */
export function PixelTag({ children, tone = "red", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "pixel inline-flex items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-[0.55rem] leading-none",
        tone === "red" && "bg-brand text-white",
        tone === "success" && "bg-success text-success-foreground",
        tone === "warning" && "bg-warning text-warning-foreground",
        tone === "danger" && "bg-danger text-white",
        tone === "neutral" && "bg-surface-3 text-fg",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** "PLAYER 1" = professor(a) · "PLAYER 2" = convidado. */
export function PlayerTag({ player, className }: { player: 1 | 2; className?: string }) {
  return (
    <PixelTag tone={player === 1 ? "red" : "neutral"} className={className}>
      {`PLAYER ${player}`}
    </PixelTag>
  );
}

/** Rótulo em fita de papel (como a faixa do cartaz). */
export function TapeLabel({
  children,
  className,
  rotate = -1.5,
}: {
  children: React.ReactNode;
  className?: string;
  rotate?: number;
}) {
  return (
    <span
      className={cn("tape display inline-block px-3.5 py-1.5 text-base leading-none", className)}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </span>
  );
}

/** Painel (cartão) escuro com título condensado e ícone. */
export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  tone,
  id,
}: {
  title?: React.ReactNode;
  icon?: PixelIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: "red";
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative rounded-2xl border border-line bg-gradient-to-b from-surface to-ink-2 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] sm:p-5",
        tone === "red" && "border-red/40 shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_0_32px_-18px_var(--glow)]",
        className,
      )}
    >
      {title ? (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display flex items-center gap-2 text-[1.35rem] text-fg">
            {Icon ? <Icon className="size-5 text-red" /> : null}
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Mensagem vazia com humor discreto (sem emojis). */
export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: PixelIcon;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center", className)}>
      <Icon className="size-10 animate-float text-fg-dim" />
      <p className="display mt-3 text-xl text-fg">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm text-fg-muted">{children}</div> : null}
    </div>
  );
}
