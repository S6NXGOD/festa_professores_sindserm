"use client";

import { useEffect } from "react";

/** Abre a caixa de impressão automaticamente (usado em ?imprimir=1). */
export function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => window.print(), 500);
    return () => window.clearTimeout(timer);
  }, [enabled]);
  return null;
}
