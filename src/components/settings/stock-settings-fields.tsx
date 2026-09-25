"use client";

import { Controller, type UseFormReturn, useWatch } from "react-hook-form";
import { FormField } from "@/components/forms/form-field";
import { Check, Package, Sliders } from "@/components/icons/pixel";
import { Input } from "@/components/ui/input";
import type { StockSettingsData, StockSettingsInput } from "@/domain/schemas";
import { cn } from "@/lib/utils";

export type StockForm = UseFormReturn<StockSettingsInput, unknown, StockSettingsData>;

function numberValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

export function StockFields({
  form,
  delivered,
}: {
  form: StockForm;
  /** Quantidades já entregues (na tela de configurações). */
  delivered?: { member: number; guest: number; employee?: number };
}) {
  const mode = useWatch({ control: form.control, name: "stockMode" });
  const e = form.formState.errors;
  const options = [
    { value: "SINGLE" as const, icon: Package, title: "Estoque único", text: "Um total só, para professoras, professores e convidados." },
    { value: "SPLIT" as const, icon: Sliders, title: "Estoque separado", text: "Quantidades distintas: professor(a) e convidado." },
  ];

  const numberField = (
    name: "totalAll" | "totalMember" | "totalGuest" | "totalEmployee" | "lowStockThreshold",
    id: string,
    label: string,
    hint?: string,
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormField id={id} label={label} description={hint} error={e[name]?.message}>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="tabular"
            value={numberValue(field.value)}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
          />
        </FormField>
      )}
    />
  );

  return (
    <div className="space-y-5">
      <Controller
        control={form.control}
        name="stockMode"
        render={({ field }) => (
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Modo de estoque">
            {options.map((option) => {
              const selected = field.value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => field.onChange(option.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-[border-color,background-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-red/50",
                    selected ? "border-red bg-brand-soft shadow-[0_0_24px_-12px_var(--glow)]" : "border-line-strong bg-surface-2 hover:border-[#55555c]",
                  )}
                >
                  <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-lg", selected ? "bg-brand text-white" : "bg-surface-3 text-fg-muted")}>
                    <option.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-fg">{option.title}</span>
                    <span className="block text-sm text-fg-muted">{option.text}</span>
                  </span>
                  {selected ? <Check className="size-5 text-red" /> : null}
                </button>
              );
            })}
          </div>
        )}
      />

      {mode === "SINGLE" ? (
        numberField("totalAll", "stock-all", "Quantidade total de kits", delivered ? `Já entregues: ${delivered.member + delivered.guest}` : undefined)
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {numberField("totalMember", "stock-member", "Kits de professor(a)", delivered ? `Já entregues: ${delivered.member}` : undefined)}
          {numberField("totalGuest", "stock-guest", "Kits de convidado", delivered ? `Já entregues: ${delivered.guest}` : undefined)}
        </div>
      )}

      <div className="rounded-xl border-2 border-warning/40 bg-warning-soft p-4">
        {numberField(
          "totalEmployee",
          "stock-employee",
          "Kits dos colaboradores (estoque separado)",
          `Para a diretoria, os funcionários e os prestadores de serviço do SINDSERM e os convidados deles (1 kit cada). Deixe 0 se ninguém da casa for liberado.${
            delivered?.employee ? ` Já entregues: ${delivered.employee}.` : ""
          }`,
        )}
      </div>

      {numberField(
        "lowStockThreshold",
        "stock-threshold",
        "Alertar quando restarem até",
        "Quando o saldo chegar a este número, o painel avisa que o estoque está baixo. Nos kits dos colaboradores, o aviso aparece quando o que resta não dá para os colaboradores e convidados que ainda vão receber.",
      )}
    </div>
  );
}
