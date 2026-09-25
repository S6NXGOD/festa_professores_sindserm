"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowDown } from "@/components/icons/pixel";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/**
 * Seta animada "tem mais embaixo": aparece enquanto o alvo (ex.: os vouchers)
 * está abaixo da tela, leva até ele com um toque e some quando ele aparece.
 */
export function ScrollHint({
  targetId,
  label,
  className,
  block = "start",
}: {
  targetId: string;
  label: string;
  className?: string;
  /** Onde o alvo para na tela (um botão fica melhor no meio). */
  block?: ScrollLogicalPosition;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ready = false;
    let below = false;
    let observer: IntersectionObserver | null = null;
    let retry: number | undefined;
    let tries = 0;
    // Espera a página assentar (animações de entrada) antes de sugerir a rolagem.
    const timer = window.setTimeout(() => {
      ready = true;
      setVisible(below);
    }, 900);
    // O alvo pode entrar na tela com animação: procura de novo por alguns segundos.
    const attach = () => {
      const target = document.getElementById(targetId);
      if (!target) {
        if (tries++ < 20) retry = window.setTimeout(attach, 150);
        return;
      }
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          below = !entry.isIntersecting && entry.boundingClientRect.top > 0;
          if (ready) setVisible(below);
        },
        { rootMargin: "0px 0px -15% 0px" },
      );
      observer.observe(target);
    };
    attach();
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(retry);
      observer?.disconnect();
    };
  }, [targetId]);

  function go() {
    playSound("blip");
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block });
  }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          onClick={go}
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
          className={cn(
            "no-print fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-red/70 bg-ink/90 py-2 pr-3 pl-4 text-fg shadow-[0_0_30px_-6px_var(--glow)] backdrop-blur outline-none focus-visible:ring-[3px] focus-visible:ring-red/50",
            className,
          )}
          aria-label={`${label}: rolar para baixo`}
          data-testid="scroll-hint"
        >
          <span className="pixel text-[0.55rem] whitespace-nowrap">{label}</span>
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-red text-white shadow-[0_3px_0_0_var(--brand-strong)]">
            <ArrowDown className="size-5 animate-bounce motion-reduce:animate-none" />
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
