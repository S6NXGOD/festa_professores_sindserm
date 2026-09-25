"use client";

import { EMPLOYEE_CATEGORY_LABEL } from "@/domain/labels";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Building, ChevronRight, Login, MemberCard, Search, User, Users } from "@/components/icons/pixel";
import { AffiliationBadge, ToneBadge } from "@/components/status/status-badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { maskCpfInput } from "@/lib/cpf";
import { formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { searchPeopleAction } from "@/server/actions/gate";
import type { PersonSearchResult } from "@/server/services/people";
import { useDebouncedSearch } from "./use-debounced-search";

type Mode = "name" | "cpf";

const NUMERIC_QUERY = /^[\d.\-\s]+$/;

/**
 * Quando a busca pode ser disparada. Sem permissão para ver o CPF completo
 * (Segurança), a busca por CPF exige os 11 dígitos — o servidor aplica a mesma regra.
 */
function readiness(value: string, mode: Mode, requireFullCpf: boolean): { ready: boolean; hint: string | null } {
  const digits = value.replace(/\D/g, "");
  if (mode === "cpf" || NUMERIC_QUERY.test(value.trim())) {
    if (!requireFullCpf) return { ready: digits.length >= 3, hint: null };
    if (digits.length === 11) return { ready: true, hint: null };
    // Código do voucher só com números (raro), digitado na aba Nome.
    if (mode === "name" && digits.length === 8) return { ready: true, hint: null };
    return { ready: false, hint: digits.length > 0 ? "Digite o CPF completo (11 dígitos) para buscar." : null };
  }
  return { ready: value.trim().length >= 2, hint: null };
}

/** Busca manual por nome ou CPF (sempre disponível, mesmo sem câmera). */
export function GateSearch({
  basePath = "/portaria/pessoa",
  autoFocus = false,
  requireFullCpf = false,
}: {
  basePath?: string;
  autoFocus?: boolean;
  requireFullCpf?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("name");
  const [query, setQuery] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const search = useCallback((text: string) => searchPeopleAction(text, "auto"), []);
  const { results, loading, error, run } = useDebouncedSearch<PersonSearchResult>(search);

  function onQueryChange(raw: string) {
    const value = mode === "cpf" ? maskCpfInput(raw) : raw;
    const state = readiness(value, mode, requireFullCpf);
    setQuery(value);
    setHint(state.hint);
    run(value, state.ready);
  }

  function onModeChange(next: Mode) {
    setMode(next);
    setQuery("");
    setHint(null);
    run("", false);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-ink p-1" role="tablist" aria-label="Tipo de busca">
        {(
          [
            { value: "name", label: "Nome ou código", icon: User },
            { value: "cpf", label: "CPF", icon: MemberCard },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={mode === option.value}
            onClick={() => onModeChange(option.value)}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-md text-sm font-bold transition-all",
              mode === option.value ? "bg-surface-3 text-fg shadow-[0_3px_0_0_#000]" : "text-fg-muted hover:text-fg",
            )}
          >
            <option.icon className="size-4" /> {option.label}
          </button>
        ))}
      </div>

      <label className="relative block">
        <span className="sr-only">{mode === "cpf" ? "Buscar por CPF" : "Buscar por nome ou código"}</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-fg-dim" />
        <Input
          autoFocus={autoFocus}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          inputMode={mode === "cpf" ? "numeric" : "search"}
          placeholder={mode === "cpf" ? "000.000.000-00" : "Nome, matrícula ou código"}
          className="h-14 pl-12 text-lg"
          autoComplete="off"
          data-testid="gate-search-input"
        />
      </label>

      {hint ? <p className="px-1 text-sm font-semibold text-warning">{hint}</p> : null}

      {error ? <p className="rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</p> : null}

      {loading && !results ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : null}

      {results && results.length === 0 && !loading ? (
        <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-line px-6 py-8 text-center">
          <Search className="size-8 text-fg-dim" />
          <p className="display mt-2 text-xl text-fg">Ninguém encontrado</p>
          <p className="text-sm text-fg-muted">Confira a grafia ou tente pelo CPF.</p>
        </div>
      ) : null}

      <ul className={cn("space-y-2 transition-opacity", loading && "opacity-60")}>
        <AnimatePresence initial={false}>
          {results?.map((person, index) => (
            <motion.li
              key={person.personId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.025, 0.2) }}
            >
              <Link
                href={`${basePath}/${person.personId}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5 transition-[border-color,box-shadow,transform] outline-none hover:border-red/60 hover:shadow-[0_0_24px_-14px_var(--glow)] focus-visible:ring-[3px] focus-visible:ring-red/50 active:scale-[0.99]"
                data-testid="gate-search-result"
              >
                <span
                  className={cn(
                    "inline-flex size-11 shrink-0 items-center justify-center rounded-lg",
                    person.checkedInAt ? "bg-success text-success-foreground" : "bg-surface-3 text-fg-muted",
                  )}
                >
                  {person.checkedInAt ? <Login className="size-5" /> : person.hostName ? <Users className="size-5" /> : <User className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-fg">{person.fullName}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                    <span className="font-mono">{person.cpfDisplay}</span>
                    {person.employee ? (
                      <ToneBadge tone="warning" icon={Building}>
                        {EMPLOYEE_CATEGORY_LABEL[person.employee.category]}{person.employee.jobTitle ? ` · ${person.employee.jobTitle}` : ""}
                      </ToneBadge>
                    ) : null}
                    {person.memberStatus ? <AffiliationBadge status={person.memberStatus} short /> : null}
                    {person.hostName ? (
                      <ToneBadge tone="info" icon={Users}>
                        Convidado de {person.hostName}
                        {person.hostIsEmployee ? " (colaborador)" : ""}
                      </ToneBadge>
                    ) : null}
                    {person.checkedInAt ? (
                      <ToneBadge tone="success" icon={Login}>
                        Entrou {formatTime(person.checkedInAt)}
                      </ToneBadge>
                    ) : null}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-fg-dim" />
              </Link>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
