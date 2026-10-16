import { DESK_CATEGORY_ORDER, type DeskCategory } from "@/domain/desk-category";
import { cn } from "@/lib/utils";
import { DESK_CATEGORY_STYLE } from "./category-style";

/** Etiqueta colorida do grupo da pessoa (professor(a), convidado(a), diretoria, cortesia...). */
export function DeskCategoryChip({ category, size = "sm", className }: { category: DeskCategory; size?: "sm" | "md"; className?: string }) {
  const style = DESK_CATEGORY_STYLE[category];
  return (
    <span
      className={cn(
        "pixel inline-flex shrink-0 items-center rounded-[4px] leading-none whitespace-nowrap",
        size === "md" ? "px-2 py-1.5 text-[0.55rem]" : "px-1.5 py-1 text-[0.5rem]",
        className,
      )}
      style={{ backgroundColor: style.color, color: style.text }}
      data-testid="desk-category"
      data-category={category}
    >
      {style.label}
    </span>
  );
}

/** Legenda das cores da mesa, numa linha que rola de lado no celular. */
export function DeskCategoryLegend({ className }: { className?: string }) {
  return (
    <div className={cn("-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1", className)} aria-label="Cores de cada grupo" data-testid="desk-legend">
      {DESK_CATEGORY_ORDER.map((category) => (
        <DeskCategoryChip key={category} category={category} />
      ))}
    </div>
  );
}
