"use client";

import { Building, Crown, type PixelIcon, Settings } from "@/components/icons/pixel";
import { EMPLOYEE_CATEGORY_LABEL } from "@/domain/labels";
import { EMPLOYEE_CATEGORIES, type EmployeeCategory } from "@/domain/types";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/**
 * Identidade de cada categoria de colaborador(a) do SINDSERM — todas no
 * "passe da casa", cada uma com o seu metal: diretoria em platina, funcionários
 * em dourado (o de sempre) e prestadores de serviço em ciano (cor da arte da festa).
 */
export const CATEGORY_STYLE: Record<
  EmployeeCategory,
  { icon: PixelIcon; text: string; chip: string; selected: string; hint: string }
> = {
  BOARD: {
    icon: Crown,
    text: "text-[#f4f4f5]",
    chip: "border-[#e4e4e7]/60 bg-white/10 text-[#f4f4f5]",
    selected: "border-[#e4e4e7] bg-white/12 text-[#f4f4f5] shadow-[0_0_18px_-8px_rgb(255_255_255/0.7)]",
    hint: "Presidência, secretarias e demais cargos da diretoria.",
  },
  STAFF: {
    icon: Building,
    text: "text-warning",
    chip: "border-warning/50 bg-warning-soft text-warning",
    selected: "border-warning bg-warning/15 text-warning shadow-[0_0_18px_-8px_rgb(248_192_0/0.7)]",
    hint: "Quem trabalha no sindicato (secretaria, financeiro, jurídico...).",
  },
  CONTRACTOR: {
    icon: Settings,
    text: "text-[#67e8f9]",
    chip: "border-[#22d3ee]/55 bg-[#22d3ee]/12 text-[#67e8f9]",
    selected: "border-[#22d3ee] bg-[#22d3ee]/15 text-[#67e8f9] shadow-[0_0_18px_-8px_rgb(34_211_238/0.7)]",
    hint: "Quem presta serviço ao sindicato (limpeza, segurança, TI...).",
  },
};

/** Etiqueta da categoria (lista, portaria, busca). */
export function CategoryChip({ category, className }: { category: EmployeeCategory; className?: string }) {
  const style = CATEGORY_STYLE[category];
  const Icon = style.icon;
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs font-bold", style.chip, className)}
      data-testid="employee-category"
    >
      <Icon className="size-3.5" /> {EMPLOYEE_CATEGORY_LABEL[category]}
    </span>
  );
}

/** Escolha da categoria: três botões grandes, fáceis de tocar no celular. */
export function CategoryPicker({
  value,
  onChange,
  label = "Categoria",
}: {
  value: EmployeeCategory;
  onChange: (category: EmployeeCategory) => void;
  label?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-bold text-fg">{label}</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={label}>
        {EMPLOYEE_CATEGORIES.map((category) => {
          const style = CATEGORY_STYLE[category];
          const Icon = style.icon;
          const selected = value === category;
          return (
            <button
              key={category}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                playSound("blip");
                onChange(category);
              }}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1.5 py-2 text-center text-xs font-bold transition-[color,background-color,border-color,box-shadow,transform] active:scale-95",
                selected ? style.selected : "border-line-strong bg-surface-2 text-fg-muted hover:text-fg",
              )}
              data-testid={`category-${category}`}
            >
              <Icon className="size-5" />
              <span className="leading-tight">{EMPLOYEE_CATEGORY_LABEL[category]}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-fg-muted">{CATEGORY_STYLE[value].hint} Mesma regra para todos: voucher, 1 kit e 1 convidado.</p>
    </div>
  );
}
