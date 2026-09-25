"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { monthName } from "@/domain/affiliation-text";

/** "A partir do mês de ___ do ano de ___" (como na ficha impressa). */
export function ContributionMonthField({
  id,
  value,
  onChange,
  invalid,
  baseYear,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** Ano atual (vem do servidor, no fuso do evento). */
  baseYear: number;
}) {
  const [year, month] = value.split("-");
  const years = [baseYear, baseYear + 1];
  if (year && !years.includes(Number(year))) years.unshift(Number(year));
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
      <NativeSelect
        id={id}
        aria-label="Mês de início do desconto"
        className="w-full"
        value={month}
        aria-invalid={invalid}
        onChange={(event) => onChange(`${year}-${event.target.value}`)}
      >
        {Array.from({ length: 12 }, (_, i) => {
          const m = String(i + 1).padStart(2, "0");
          return (
            <NativeSelectOption key={m} value={m}>
              {monthName(i + 1)}
            </NativeSelectOption>
          );
        })}
      </NativeSelect>
      <NativeSelect
        aria-label="Ano de início do desconto"
        className="w-full"
        value={year}
        aria-invalid={invalid}
        onChange={(event) => onChange(`${event.target.value}-${month}`)}
      >
        {years.map((y) => (
          <NativeSelectOption key={y} value={String(y)}>
            {y}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
