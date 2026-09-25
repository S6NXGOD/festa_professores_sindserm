"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { ChevronDown } from "@/components/icons/pixel";
import { cn } from "@/lib/utils";

/**
 * Seção que abre e fecha: na portaria, detalhes e ações que não são o principal
 * na hora de liberar a entrada ficam guardados aqui, a um toque.
 */
export function Disclosure({
  title,
  hint,
  defaultOpen = false,
  variant = "box",
  children,
  className,
  testId,
}: {
  title: string;
  /** O que tem dentro, numa linha (aparece fechado). */
  hint?: string;
  defaultOpen?: boolean;
  /** "box": cartão com borda; "plain": só a linha do título (o conteúdo já tem os próprios cartões). */
  variant?: "box" | "plain";
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cn(variant === "box" && "rounded-xl border border-line bg-surface-2/50", className)} data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group flex w-full items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-red",
          variant === "box" ? "rounded-xl px-3.5 py-3" : "rounded-lg border-t border-line px-1 pt-4 pb-1",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[0.7rem] font-bold tracking-[0.1em] text-fg-muted uppercase group-hover:text-fg">{title}</span>
          {hint ? <span className="block truncate text-xs text-fg-dim">{hint}</span> : null}
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-fg-dim transition-transform duration-200", open && "rotate-180 text-fg")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className={variant === "box" ? "px-3.5 pb-3.5" : "pt-3"}>{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
