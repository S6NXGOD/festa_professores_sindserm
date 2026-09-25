"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedSearch } from "@/components/gate/use-debounced-search";
import { Loader, Search } from "@/components/icons/pixel";
import { AffiliationBadge } from "@/components/status/status-badge";
import { Input } from "@/components/ui/input";
import { searchPeopleAction } from "@/server/actions/gate";
import type { PersonSearchResult } from "@/server/services/people";

/** Busca rápida (nome, CPF, matrícula ou código) disponível em todo o painel. */
export function QuickSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const search = useCallback((text: string) => searchPeopleAction(text, "auto"), []);
  const { results, loading, run } = useDebouncedSearch<PersonSearchResult>(search, 250);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function onChange(value: string) {
    setQuery(value);
    setOpen(true);
    const text = value.trim();
    const ready = /\p{L}/u.test(text) ? text.length >= 2 : text.replace(/\D/g, "").length >= 3;
    run(text, ready);
  }

  const visible = (results ?? []).slice(0, 8);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-fg-dim" />
      <Input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        placeholder="Nome, CPF ou matrícula"
        className="h-11 pl-11"
        aria-label="Busca rápida por nome, CPF ou matrícula"
      />
      {loading ? <Loader className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin-steps text-fg-muted" /> : null}
      {open && results !== null ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line-strong bg-popover shadow-2xl">
          {visible.length === 0 ? (
            <p className="px-4 py-3 text-sm text-fg-muted">Nenhum resultado.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {visible.map((person) => (
                <li key={person.personId}>
                  <Link
                    href={`/painel/participantes/${person.personId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-fg">{person.fullName}</span>
                      <span className="block text-xs text-fg-muted">
                        <span className="font-mono">{person.cpfDisplay}</span>
                        {person.hostName ? ` · convidado de ${person.hostName}` : ""}
                      </span>
                    </span>
                    {person.memberStatus ? <AffiliationBadge status={person.memberStatus} short /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
