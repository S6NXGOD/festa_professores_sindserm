"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { Led } from "./bits";

/**
 * Placar "ao vivo": atualiza a tela sozinho (só com a aba visível e nunca duas
 * atualizações ao mesmo tempo) e toca a moeda quando o número de pessoas na
 * pista aumenta.
 */
export function LiveRefresh({ seconds = 20, score, className }: { seconds?: number; score?: number; className?: string }) {
  const router = useRouter();
  const last = useRef(score);
  const [refreshing, startRefresh] = useTransition();
  const busy = useRef(false);

  useEffect(() => {
    busy.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || busy.current) return;
      startRefresh(() => router.refresh());
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);

  useEffect(() => {
    if (score !== undefined && last.current !== undefined && score > last.current) playSound("coin");
    last.current = score;
  }, [score]);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-md border border-line bg-ink/70 px-2 py-1", className)}
      title={`A tela se atualiza sozinha a cada ${seconds} segundos`}
      data-testid="live-refresh"
    >
      <Led tone="success" blink />
      <span className="pixel text-[0.5rem] text-fg-muted">Ao vivo</span>
    </span>
  );
}
