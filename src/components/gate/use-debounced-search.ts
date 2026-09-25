"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { callAction } from "@/lib/call-action";

/**
 * Busca com debounce disparada a partir de eventos (digitação), descartando
 * respostas antigas que cheguem fora de ordem.
 */
export function useDebouncedSearch<T>(search: (query: string) => Promise<ActionResult<T[]>>, delay = 280) {
  const [results, setResults] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = useCallback(
    (query: string, ready: boolean) => {
      window.clearTimeout(timer.current);
      const id = ++requestId.current;
      if (!ready) {
        setResults(null);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      timer.current = window.setTimeout(async () => {
        const result = await callAction(search(query));
        if (id !== requestId.current) return;
        setLoading(false);
        if (result.ok) {
          setResults(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
      }, delay);
    },
    [search, delay],
  );

  return { results, loading, error, run };
}
