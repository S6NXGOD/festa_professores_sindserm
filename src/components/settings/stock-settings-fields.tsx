"use client";

import { Controller, type UseFormReturn, useWatch } from "react-hook-form";
import { FormField } from "@/components/forms/form-field";
import { Check, Package, Sliders, Users } from "@/components/icons/pixel";
import { Input } from "@/components/ui/input";
import type { StockSettingsData, StockSettingsInput } from "@/domain/schemas";
import { cn } from "@/lib/utils";
import { EDITION, T } from "@/domain/edition";

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
    {
      value: "UNIFIED" as const,
      icon: Users,
      title: "Um estoque só para todos",
      text: EDITION.sharedKit
        ? `${T.PeopleList}, colaboradores (1 kit para os dois, com o convidado) e cortesias tiram do mesmo total.`
        : `${T.PeopleList}, convidados, colaboradores e cortesias tiram do mesmo total.`,
      badge: "Mais simples",
    },
    {
      value: "SINGLE" as const,
      icon: Package,
      title: "Geral + colaboradores",
      text: EDITION.sharedKit
        ? `Um total para ${T.peopleList} (1 kit por inscrição, para os dois); outro para colaboradores (kit para os dois) e cortesias.`
        : `Um total para ${T.peopleList} e convidados; outro para colaboradores e cortesias.`,
    },
    { value: "SPLIT" as const, icon: Sliders, title: "Tudo separado", text: `${T.Person}, convidado e colaboradores, cada um com a sua quantidade.` },
    // Kit dividido: o convidado de inscrito não tem kit, então o estoque separado de convidado não serve (só aparece se já estiver em uso).
  ].filter((option) => !(EDITION.sharedKit && option.value === "SPLIT" && mode !== "SPLIT"));
  const deliveredAll = delivered ? delivered.member + delivered.guest + (delivered.employee ?? 0) : 0;

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
          <div className="grid gap-3 lg:grid-cols-3" role="radiogroup" aria-label="Modo de estoque">
            {options.map((option) => {
              const selected = field.value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    // Juntando os estoques, o total já vem somado (geral + colaboradores): ninguém precisa fazer a conta.
                    if (option.value === "UNIFIED" && field.value !== "UNIFIED") {
                      const values = form.getValues();
                      const count = (value: unknown) => Number(value) || 0;
                      const general = field.value === "SPLIT" ? count(values.totalMember) + count(values.totalGuest) : count(values.totalAll);
                      form.setValue("totalAll", general + count(values.totalEmployee), { shouldDirty: true });
                    }
                    field.onChange(option.value);
                  }}
                  data-testid={`stock-mode-${option.value.toLowerCase()}`}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-[border-color,background-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-red/50",
                    selected ? "border-red bg-brand-soft shadow-[0_0_24px_-12px_var(--glow)]" : "border-line-strong bg-surface-2 hover:border-[#55555c]",
                  )}
                >
                  <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-lg", selected ? "bg-brand text-white" : "bg-surface-3 text-fg-muted")}>
                    <option.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-fg">
                      {option.title}
                      {"badge" in option ? <span className="pixel ml-2 rounded bg-success/20 px-1.5 py-0.5 align-middle text-[0.45rem] text-success-text">{option.badge}</span> : null}
                    </span>
                    <span className="block text-sm text-fg-muted">{option.text}</span>
                  </span>
                  {selected ? <Check className="size-5 text-red" /> : null}
                </button>
              );
            })}
          </div>
        )}
      />

      {mode === "UNIFIED" ? (
        numberField(
          "totalAll",
          "stock-all",
          "Quantidade total de kits (para todos)",
          `${
            EDITION.sharedKit
              ? `Todos os kits que vocês têm: 1 por inscrição e 1 por colaborador(a) (para os dois, com o convidado) e os das cortesias.`
              : `Todos os kits que vocês têm, para ${T.peopleList}, convidados, colaboradores e cortesias.`
          }${delivered ? ` Já entregues: ${deliveredAll}.` : ""}`,
        )
      ) : mode === "SINGLE" ? (
        numberField("totalAll", "stock-all", "Quantidade total de kits", delivered ? `Já entregues: ${delivered.member + delivered.guest}` : undefined)
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {numberField("totalMember", "stock-member", `Kits de ${T.person}`, delivered ? `Já entregues: ${delivered.member}` : undefined)}
          {numberField("totalGuest", "stock-guest", "Kits de convidado", delivered ? `Já entregues: ${delivered.guest}` : undefined)}
        </div>
      )}

      {mode === "UNIFIED" ? null : (
      <div className="rounded-xl border-2 border-warning/40 bg-warning-soft p-4">
        {numberField(
          "totalEmployee",
          "stock-employee",
          "Kits dos colaboradores (estoque separado)",
          `${EDITION.sharedKit ? "Para a diretoria, os funcionários e os prestadores de serviço do SINDSERM (1 kit cada, para dividir com o convidado) e as cortesias." : "Para a diretoria, os funcionários e os prestadores de serviço do SINDSERM e os convidados deles (1 kit cada)."} Deixe 0 se ninguém da casa for liberado.${
            delivered?.employee ? ` Já entregues: ${delivered.employee}.` : ""
          }`,
        )}
      </div>
      )}

      {numberField(
        "lowStockThreshold",
        "stock-threshold",
        "Alertar quando restarem até",
        mode === "UNIFIED"
          ? "Quando o saldo chegar a este número, o painel avisa que o estoque está baixo."
          : "Quando o saldo chegar a este número, o painel avisa que o estoque está baixo. Nos kits dos colaboradores, o aviso aparece quando o que resta não dá para os colaboradores e convidados que ainda vão receber.",
      )}
    </div>
  );
}
