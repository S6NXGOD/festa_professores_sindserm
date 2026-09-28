"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, Gamepad, PartyPopper } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { TutorialStep } from "@/domain/tutorial";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { finishTutorialAction } from "@/server/actions/users";
import { TutorialSceneView } from "./tutorial-scenes";

const OPEN_EVENT = "festa:tutorial";

/** Abre o tutorial de novo (item "Tutorial" do menu do nome). */
export function openTutorial() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Tutorial do primeiro acesso: abre sozinho uma vez (até a pessoa terminar ou
 * pular) e pode ser revisto pelo menu. Cada fase tem uma mini-cena animada.
 */
export function Tutorial({ steps, autoOpen, initials }: { steps: TutorialStep[]; autoOpen: boolean; initials: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const saved = useRef(!autoOpen);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  useEffect(() => {
    function reopen() {
      setIndex(0);
      setDirection(1);
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  const close = useCallback(
    (finished: boolean) => {
      setOpen(false);
      if (finished) {
        playSound("levelup");
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 }, colors: ["#ff2626", "#f8c000", "#ffffff", "#ff4fb4", "#22d3ee"], shapes: ["square"], flat: true });
        }
      }
      // Primeira vez: grava que a pessoa já viu (terminou ou pulou) e não abre mais sozinho.
      if (!saved.current) {
        saved.current = true;
        void callAction(finishTutorialAction()).then(() => router.refresh());
      }
    },
    [router],
  );

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= steps.length) return;
      setDirection(next > index ? 1 : -1);
      setIndex(next);
      playSound("blip");
    },
    [index, steps.length],
  );

  // Setas do teclado passam as fases (Enter avança; no fim, conclui).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, index]);

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? setOpen(true) : close(false))}>
      <DialogContent
        className="gap-4 sm:max-w-lg"
        showCloseButton={false}
        // Toque fora da caixa não fecha (evita pular sem querer); Esc e "Pular" fecham.
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="tutorial"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="pixel inline-flex items-center gap-1.5 rounded-[4px] bg-red px-2 py-1 text-[0.55rem] text-white shadow-[0_3px_0_0_var(--brand-strong)]">
            <Gamepad className="size-3.5" /> Tutorial · fase {index + 1}/{steps.length}
          </span>
          {!last ? (
            <Button variant="ghost" size="sm" onClick={() => close(false)} data-testid="tutorial-skip">
              Pular
            </Button>
          ) : null}
        </div>

        {/* Barra de fases no estilo "vida" de fliperama. */}
        <div className="flex gap-1" aria-hidden>
          {steps.map((item, position) => (
            <span
              key={item.id}
              className={cn(
                "h-1.5 flex-1 rounded-[2px] transition-colors duration-300",
                position < index ? "bg-red" : position === index ? "bg-warning shadow-[0_0_8px_rgb(248_192_0/0.8)]" : "bg-line-strong",
              )}
            />
          ))}
        </div>

        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -28 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="grid gap-4"
            data-testid={`tutorial-step-${step.id}`}
          >
            <div className="relative h-40 overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_50%_120%,rgb(227_0_15/0.22),transparent_60%),linear-gradient(180deg,#0b0b0c,#141416)]">
              <TutorialSceneView scene={step.scene} initials={initials} />
            </div>
            <div>
              <DialogTitle className="display text-3xl leading-none text-fg">{step.title}</DialogTitle>
              <DialogDescription asChild>
                <ul className="mt-3 grid gap-2">
                  {step.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-[0.95rem] leading-snug text-fg-muted">
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-red" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </DialogDescription>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2">
          {index > 0 ? (
            <Button variant="outline" onClick={() => go(index - 1)} data-testid="tutorial-back">
              <ArrowLeft /> Voltar
            </Button>
          ) : null}
          {last ? (
            <Button variant="success" className="ml-auto" onClick={() => close(true)} autoFocus data-testid="tutorial-finish">
              <PartyPopper /> Bora pra festa!
            </Button>
          ) : (
            <Button className="ml-auto" onClick={() => go(index + 1)} autoFocus data-testid="tutorial-next">
              Próximo <ArrowRight />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
