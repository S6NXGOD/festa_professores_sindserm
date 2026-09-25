import Link from "next/link";
import { CountUp } from "@/components/count-up";
import { ChevronLeft, ChevronRight, type PixelIcon, Search } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export { EmptyState, Panel } from "@/components/retro/bits";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="pixel mb-2 text-[0.55rem] text-red">{eyebrow}</div> : null}
        <h1 className="display text-4xl text-fg sm:text-5xl">{title}</h1>
        {description ? <p className="mt-2 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const TILE_ACCENT = {
  brand: "from-red to-brand-strong",
  success: "from-success to-[#0f6b33]",
  warning: "from-warning to-[#8a6a00]",
  danger: "from-danger to-brand-strong",
  neutral: "from-line-strong to-line",
} as const;

const TILE_TEXT = {
  brand: "text-red",
  success: "text-success-text",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-fg-muted",
} as const;

/** Mostrador de placar (número grande, como um placar de fliperama). */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "brand",
  hint,
  href,
  testId,
  className,
}: {
  label: string;
  value: number;
  icon: PixelIcon;
  tone?: keyof typeof TILE_ACCENT;
  hint?: React.ReactNode;
  href?: string;
  testId?: string;
  className?: string;
}) {
  const content = (
    <>
      <span className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", TILE_ACCENT[tone])} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.7rem] font-bold tracking-[0.1em] text-fg-muted uppercase">{label}</p>
        <Icon className={cn("size-5", TILE_TEXT[tone])} />
      </div>
      <p className="display mt-2 text-5xl leading-none text-fg tabular" data-testid={testId}>
        <CountUp value={value} />
      </p>
      {hint ? <div className="mt-2 text-xs text-fg-muted">{hint}</div> : null}
    </>
  );
  const base = cn(
    "relative block overflow-hidden rounded-xl border border-line bg-gradient-to-b from-surface to-ink-2 p-4 pt-5 transition-[border-color,box-shadow,transform]",
    className,
  );
  return href ? (
    <Link href={href} className={cn(base, "hover:-translate-y-0.5 hover:border-red/50 hover:shadow-[0_0_28px_-14px_var(--glow)]")}>
      {content}
    </Link>
  ) : (
    <div className={base}>{content}</div>
  );
}

/**
 * Medidor em segmentos (como o VU de um aparelho de som).
 * `invert`: a cor esquenta quando o valor cai (ex.: estoque acabando).
 */
export function SegmentMeter({
  value,
  max,
  segments = 20,
  invert = false,
  label,
  className,
}: {
  value: number;
  max: number;
  segments?: number;
  invert?: boolean;
  label: string;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const lit = Math.round(ratio * segments);
  return (
    <div
      className={cn("flex h-4 gap-[3px]", className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      {Array.from({ length: segments }, (_, index) => {
        const on = index < lit;
        const position = (index + 1) / segments;
        const hot = invert ? ratio <= 0.2 : position > 0.85;
        const warm = invert ? ratio <= 0.4 : position > 0.65;
        return (
          <span
            key={index}
            className={cn(
              "flex-1 rounded-[2px] transition-colors duration-500",
              !on && "bg-surface-3",
              on && hot && "bg-red shadow-[0_0_6px_var(--red)]",
              on && !hot && warm && "bg-warning shadow-[0_0_6px_var(--warning)]",
              on && !hot && !warm && "bg-success shadow-[0_0_6px_var(--success)]",
            )}
            style={on ? { transitionDelay: `${index * 25}ms` } : undefined}
          />
        );
      })}
    </div>
  );
}

/** Paginação por links (sem JavaScript). */
export function Pagination({
  page,
  pages,
  basePath,
  params,
}: {
  page: number;
  pages: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;
  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    search.set("page", String(target));
    return `${basePath}?${search.toString()}`;
  };
  return (
    <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Paginação">
      <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "pointer-events-none opacity-40")}>
        <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1}>
          <ChevronLeft /> Anterior
        </Link>
      </Button>
      <span className="pixel text-[0.55rem] text-fg-muted tabular">
        {page}/{pages}
      </span>
      <Button asChild variant="outline" size="sm" className={cn(page >= pages && "pointer-events-none opacity-40")}>
        <Link href={href(Math.min(pages, page + 1))} aria-disabled={page >= pages}>
          Próxima <ChevronRight />
        </Link>
      </Button>
    </nav>
  );
}

/** Barra de busca/filtros via GET (funciona sem JavaScript). */
export function FilterBar({
  action,
  q,
  placeholder = "Buscar por nome, CPF ou matrícula",
  children,
}: {
  action: string;
  q?: string;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={action} method="get" className="mb-5 flex flex-col gap-2 sm:flex-row">
      <label className="relative flex-1">
        <span className="sr-only">Buscar</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-fg-dim" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="h-11 w-full rounded-lg border-2 border-input bg-surface-2 pr-3 pl-11 text-base text-fg outline-none placeholder:text-fg-dim focus-visible:border-red md:text-sm"
        />
      </label>
      {children}
      <Button type="submit" variant="secondary">
        Filtrar
      </Button>
    </form>
  );
}

export function SelectFilter({
  name,
  value,
  options,
  label,
}: {
  name: string;
  value?: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <NativeSelect name={name} defaultValue={value ?? ""} aria-label={label} className="w-full sm:w-auto [&>select]:h-11 [&>select]:font-semibold md:[&>select]:text-sm">
      {options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/**
 * Filtros em fichas (links), mais rápidos de tocar no celular. `attention`
 * marca uma fila com trabalho esperando (luz âmbar piscando).
 */
export function ChipFilters({
  basePath,
  current,
  options,
  params,
}: {
  basePath: string;
  current: string;
  options: { value: string; label: string; count?: number; attention?: boolean }[];
  params?: Record<string, string | undefined>;
}) {
  const href = (value: string) => {
    const search = new URLSearchParams();
    for (const [key, v] of Object.entries(params ?? {})) if (v) search.set(key, v);
    if (value) search.set("filtro", value);
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((option) => {
        const active = option.value === current;
        const attention = option.attention && !active;
        return (
          <Link
            key={option.value || "all"}
            href={href(option.value)}
            aria-current={active ? "page" : undefined}
            data-testid={`chip-${option.value || "all"}`}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border-2 px-3 text-sm font-bold transition-[border-color,background-color]",
              active
                ? "border-red bg-brand-soft text-fg"
                : attention
                  ? "border-warning/60 text-warning hover:border-warning"
                  : "border-line-strong text-fg-muted hover:border-[#55555c] hover:text-fg",
            )}
          >
            {attention ? <span className="size-1.5 animate-blink rounded-[1px] bg-warning shadow-[0_0_6px_var(--warning)]" aria-hidden /> : null}
            {option.label}
            {typeof option.count === "number" ? (
              <span className={cn("pixel text-[0.5rem] tabular", attention ? "text-warning" : "text-red")}>{option.count}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
