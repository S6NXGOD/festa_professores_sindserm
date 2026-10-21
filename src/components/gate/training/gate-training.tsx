"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cancel,
  Check,
  Clock,
  Close,
  Gamepad,
  Gift,
  Info,
  Loader,
  Package,
  QrCode,
  Reload,
  Shield,
  Star,
  Trophy,
  Warning,
} from "@/components/icons/pixel";
import { PixelTag, PlayerTag } from "@/components/retro/bits";
import { WalkInStamp } from "@/components/gate/walk-in-stamp";
import { Button } from "@/components/ui/button";
import { callAction } from "@/lib/call-action";
import { vibrate } from "@/lib/haptics";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { finishGateTrainingAction } from "@/server/actions/users";
import { type MiniCard, type QuickQuestion, quickQuestions, shuffled, type TrainingContext } from "./scenarios";
import { confettiLook } from "@/lib/confetti-look";

/** Acertou: a próxima situação vem sozinha neste tempo (um toque adianta). */
const AUTO_NEXT_MS = 1600;

const TONE: Record<MiniCard["tone"], string> = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-white hazard",
};
const ICON = { ok: Shield, wait: Clock, again: Reload, stop: Cancel } as const;

type Answer = { questionId: string; right: boolean };

/**
 * Treino relâmpago da portaria: um cartão por vez, duas respostas, avanço
 * automático quando acerta. Errou, a situação volta no fim (até acertar).
 * `required`: é o treino obrigatório de quem registra entradas (sem "pular").
 */
export function GateTraining({ context, required }: { context: TrainingContext; required: boolean }) {
  const router = useRouter();
  const questions = useMemo(() => quickQuestions(context), [context]);
  const [stage, setStage] = useState<"intro" | "play" | "done">("intro");
  const [round, setRound] = useState(0);
  const [queue, setQueue] = useState<number[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [firstTry, setFirstTry] = useState<Record<string, boolean>>({});
  const [combo, setCombo] = useState(0);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedOnce = useRef(false);
  // A fila também num ref: o toque e o tempo leem a mesma (sem pular duas situações).
  const queueRef = useRef<number[]>([]);

  const current: QuickQuestion | null = stage === "play" && queue.length ? questions[queue[0]!]! : null;
  const options = useMemo(
    () => (current ? shuffled(["right", "wrong"] as const, (queue[0]! + 3) * (round + 7)) : []),
    [current, queue, round],
  );
  const solved = questions.length - queue.length;
  const rightFirst = Object.values(firstTry).filter(Boolean).length;

  const store = useCallback(async () => {
    setSave("saving");
    const result = await callAction(finishGateTrainingAction());
    setSave(result.ok ? "saved" : "error");
    if (result.ok) router.refresh();
  }, [router]);

  function start() {
    const all = questions.map((_, index) => index);
    queueRef.current = all;
    setRound((r) => r + 1);
    setQueue(all);
    setFirstTry({});
    setCombo(0);
    setAnswer(null);
    setStage("play");
    playSound("coin");
  }

  function choose(right: boolean) {
    if (!current || answer) return;
    setAnswer({ questionId: current.id, right });
    setFirstTry((seen) => (current.id in seen ? seen : { ...seen, [current.id]: right }));
    if (right) {
      setCombo((value) => value + 1);
      playSound(combo + 1 >= 3 ? "powerup" : "coin");
      vibrate(40);
    } else {
      setCombo(0);
      playSound("error");
      vibrate([80, 60, 80]);
    }
  }

  /**
   * Passa para a próxima (só se ainda estiver na situação respondida: o toque e
   * o tempo não pulam duas). Acabaram as situações: fim do treino, e a portaria abre.
   */
  const advance = useCallback(
    (from: Answer) => {
      const list = queueRef.current;
      if (!list.length || questions[list[0]!]!.id !== from.questionId) return;
      const [head, ...rest] = list;
      const next = from.right ? rest : [...rest, head!];
      queueRef.current = next;
      setQueue(next);
      setAnswer(null);
      if (next.length > 0) return;
      setStage("done");
      playSound("levelup");
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        confetti({ particleCount: 110, spread: 85, origin: { y: 0.55 }, ...confettiLook(["#ff2626", "#f8c000", "#ffffff", "#ff4fb4", "#22d3ee"]), flat: true });
      }
      if (!savedOnce.current) {
        savedOnce.current = true;
        void store();
      }
    },
    [questions, store],
  );

  // Acertou: segue sozinho.
  useEffect(() => {
    if (!answer?.right) return;
    const timer = window.setTimeout(() => advance(answer), AUTO_NEXT_MS);
    return () => window.clearTimeout(timer);
  }, [answer, advance]);

  return (
    <div className="mx-auto max-w-lg" data-testid="gate-training">
      {stage === "intro" ? (
        <Intro total={questions.length} required={required} onStart={start} />
      ) : stage === "done" ? (
        <Done questions={questions} rightFirst={rightFirst} save={save} onRetrySave={store} onAgain={start} />
      ) : current ? (
        <div className="space-y-3.5">
          {/* Placar: situações resolvidas e o combo. */}
          <div className="flex items-center justify-between gap-3">
            <PixelTag tone="red">
              <Gamepad className="size-3.5" /> Treino relâmpago
            </PixelTag>
            <AnimatePresence mode="popLayout">
              {combo >= 2 ? (
                <motion.span
                  key={combo}
                  initial={{ scale: 1.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="pixel text-[0.6rem] text-warning"
                  data-testid="training-combo"
                >
                  COMBO x{combo}
                </motion.span>
              ) : null}
            </AnimatePresence>
            <span className="pixel text-[0.55rem] text-fg-muted tabular" data-testid="training-progress">
              {solved}/{questions.length}
            </span>
          </div>
          <div className="flex gap-1" aria-hidden>
            {questions.map((question, index) => (
              <span
                key={question.id}
                className={cn(
                  "h-1.5 flex-1 rounded-[2px] transition-colors duration-300",
                  !queue.includes(index) ? "bg-success" : index === queue[0] ? "bg-warning shadow-[0_0_8px_rgb(248_192_0/0.8)]" : "bg-line-strong",
                )}
              />
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${round}-${current.id}-${queue.length}`}
              initial={{ opacity: 0, x: 28, rotate: 0.8 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              exit={{ opacity: 0, x: -28, rotate: -0.8 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="space-y-3.5"
              data-testid="training-question"
              data-question={current.id}
            >
              <MiniGateCard card={current.card} />

              <p className="display text-xl leading-none text-fg">O que você faz?</p>
              <div className="grid gap-2">
                {options.map((option) => {
                  const right = option === "right";
                  const chosen = answer && answer.right === right;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => choose(right)}
                      disabled={Boolean(answer)}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-[0.98rem] leading-snug font-bold transition-[border-color,background-color,opacity,transform] outline-none focus-visible:ring-2 focus-visible:ring-red",
                        !answer && "border-line-strong bg-surface text-fg hover:border-red/60 active:scale-[0.98]",
                        answer && right && "border-success bg-success-soft text-fg",
                        answer && !right && chosen && "border-danger bg-danger-soft text-fg",
                        answer && !right && !chosen && "border-line opacity-45",
                      )}
                      data-testid={right ? "training-option-right" : "training-option-wrong"}
                    >
                      <span
                        className={cn(
                          "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
                          answer && right ? "bg-success text-success-foreground" : answer && chosen ? "bg-danger text-white" : "bg-surface-3 text-fg-muted",
                        )}
                        aria-hidden
                      >
                        {answer && right ? <Check className="size-4" /> : answer && chosen ? <Close className="size-4" /> : <span className="size-2 rounded-[2px] bg-current" />}
                      </span>
                      <span className="min-w-0">{right ? current.right : current.wrong}</span>
                    </button>
                  );
                })}
              </div>

              {answer ? <Feedback question={current} answer={answer} onNext={() => advance(answer)} /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}

function Intro({ total, required, onStart }: { total: number; required: boolean; onStart: () => void }) {
  const colors = [
    { swatch: "bg-success", name: "Verde", text: "liberado. Confirme (o kit sai junto)" },
    { swatch: "bg-warning", name: "Amarelo", text: "falta resolver. Atendimento" },
    { swatch: "bg-danger", name: "Vermelho", text: "parou. Leia o motivo na faixa" },
  ];
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border-2 border-red/50 bg-[linear-gradient(150deg,rgb(227_0_15/0.22),rgb(8_8_8/0.9)_65%)] p-5">
        <span className="scanlines pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <PixelTag tone={required ? "warning" : "red"} className="relative">
          <Gamepad className="size-3.5" /> {required ? "Antes de abrir a portaria" : "Modo treino"}
        </PixelTag>
        <h1 className="display relative mt-3 text-[2.6rem] leading-none text-fg">Treino relâmpago</h1>
        <p className="relative mt-2 text-[0.98rem] leading-relaxed text-fg-muted">
          {total} situações da porta, <strong className="text-fg">1 minuto</strong>. Toque no que você faria. Errou? Ela volta no fim.
        </p>
        <ul className="relative mt-4 grid gap-1.5">
          {colors.map((color) => (
            <li key={color.name} className="flex items-center gap-2.5 text-sm text-fg-muted">
              <span className={cn("size-3.5 shrink-0 rounded-[3px]", color.swatch)} />
              <span>
                <strong className="text-fg">{color.name}</strong>: {color.text}
              </span>
            </li>
          ))}
        </ul>
        {required ? (
          <p className="relative mt-4 flex items-start gap-2 rounded-lg bg-ink/60 px-3 py-2 text-xs text-fg-muted">
            <Info className="mt-0.5 size-3.5 shrink-0 text-warning" /> Obrigatório para quem registra entradas: terminou, a portaria abre.
          </p>
        ) : null}
      </div>
      <Button size="xl" className="w-full" onClick={onStart} autoFocus data-testid="training-start">
        <Gamepad /> Começar
      </Button>
    </div>
  );
}

/** O cartão da portaria, resumido (mesmas cores, títulos e jeito do cartão de verdade). */
function MiniGateCard({ card }: { card: MiniCard }) {
  const Icon = ICON[card.icon];
  return (
    <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_20px_50px_-30px_rgb(0_0_0/0.95)]" data-testid="training-card">
      <div className={cn("px-4 py-3", TONE[card.tone])}>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-black/15">
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="pixel text-[0.5rem] opacity-80">{card.kicker}</p>
            <p className="display mt-0.5 text-[1.45rem] leading-[0.95]">{card.title}</p>
          </div>
        </div>
        {card.detail ? <p className="mt-2 text-sm leading-snug font-bold opacity-95">{card.detail}</p> : null}
      </div>
      {card.name ? (
        <div className="space-y-2.5 px-4 py-3.5">
          <div>
            {card.tags?.length ? (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                {card.tags.map((tag) =>
                  tag === "MINOR" ? (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-warning px-1.5 py-1 text-[0.62rem] font-bold text-warning-foreground">
                      <Warning className="size-3" /> MENOR DE 18
                    </span>
                  ) : tag === "WALK_IN" ? (
                    <WalkInStamp key={tag} />
                  ) : (
                    <PlayerTag key={tag} player={tag === "P1" ? 1 : 2} />
                  ),
                )}
              </div>
            ) : null}
            <p className="display text-[1.75rem] leading-none text-fg">{card.name}</p>
            {card.role ? <p className="mt-1 text-sm font-semibold text-fg-muted">{card.role}</p> : null}
          </div>
          {card.kit ? (
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                card.kit.kind === "give" ? "border-red/60 bg-brand-soft" : card.kit.kind === "desk" ? "border-success/50 bg-success-soft" : "border-line-strong bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg",
                  card.kit.kind === "give"
                    ? "bg-red text-white shadow-[0_3px_0_0_var(--brand-strong)]"
                    : card.kit.kind === "desk"
                      ? "bg-success text-white"
                      : "bg-surface-3 text-fg-muted",
                )}
              >
                {card.kit.kind === "give" ? (
                  <Gift className="size-6" />
                ) : card.kit.kind === "desk" ? (
                  <Package className="size-6" />
                ) : card.kit.kind === "wait" ? (
                  <Clock className="size-6" />
                ) : (
                  <Info className="size-6" />
                )}
                {card.kit.count === 2 ? (
                  <span className="pixel absolute -top-2 -right-2 rounded-md bg-white px-1 py-0.5 text-[0.5rem] text-red shadow">x2</span>
                ) : null}
              </span>
              <div className="min-w-0">
                <p className="display text-xl leading-none text-fg">{card.kit.title}</p>
                <p className="mt-0.5 text-xs text-fg-muted">{card.kit.detail}</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Feedback({ question, answer, onNext }: { question: QuickQuestion; answer: Answer; onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("relative overflow-hidden rounded-xl border-2 p-3.5", answer.right ? "border-success/70 bg-success-soft" : "border-danger/70 bg-danger-soft")}
      role="status"
      data-testid="training-feedback"
    >
      <p className={cn("pixel flex items-center gap-1.5 text-[0.55rem]", answer.right ? "text-success-text" : "text-danger")}>
        {answer.right ? <Check className="size-4" /> : <Close className="size-4" />}
        {answer.right ? "Isso!" : "Quase"}
      </p>
      <p className="mt-1.5 text-[0.95rem] leading-snug text-fg">
        {answer.right ? null : (
          <>
            <strong>O certo: {question.right.charAt(0).toLowerCase() + question.right.slice(1)}.</strong>{" "}
          </>
        )}
        {question.lesson}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-fg-muted">{answer.right ? "Já vem a próxima…" : "Essa volta no fim, para fixar."}</span>
        <Button size="sm" variant={answer.right ? "success" : "default"} onClick={onNext} autoFocus data-testid="training-next">
          {answer.right ? "Próxima" : "Entendi"}
        </Button>
      </div>
      {answer.right ? (
        // A barrinha do tempo da próxima.
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1 origin-left bg-success"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: AUTO_NEXT_MS / 1000, ease: "linear" }}
        />
      ) : null}
    </motion.div>
  );
}

function Done({
  questions,
  rightFirst,
  save,
  onRetrySave,
  onAgain,
}: {
  questions: QuickQuestion[];
  rightFirst: number;
  save: "idle" | "saving" | "saved" | "error";
  onRetrySave: () => void;
  onAgain: () => void;
}) {
  const total = questions.length;
  const stars = rightFirst === total ? 3 : rightFirst >= total - 2 ? 2 : 1;
  return (
    <div className="space-y-4" data-testid="training-done">
      <div className="relative overflow-hidden rounded-2xl border-2 border-warning/60 bg-[linear-gradient(150deg,rgb(248_192_0/0.18),rgb(8_8_8/0.9)_65%)] p-5 text-center">
        <span className="scanlines pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <motion.span
          initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 14 }}
          className="relative mx-auto inline-flex size-16 items-center justify-center rounded-xl bg-warning text-warning-foreground shadow-[0_4px_0_0_#8a6a00]"
        >
          <Trophy className="size-9" />
        </motion.span>
        <p className="pixel relative mt-3 text-[0.55rem] text-warning">Treino completo</p>
        <div className="relative mt-2 flex justify-center gap-1.5" aria-label={`${stars} de 3 estrelas`}>
          {[1, 2, 3].map((n) => (
            <motion.span key={n} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15 * n, type: "spring", stiffness: 400, damping: 12 }}>
              <Star className={cn("size-8", n <= stars ? "text-warning drop-shadow-[0_0_10px_rgb(248_192_0/0.7)]" : "text-fg-dim")} />
            </motion.span>
          ))}
        </div>
        <p className="display relative mt-2 text-3xl leading-none text-fg" data-testid="training-score">
          {rightFirst} de {total} de primeira
        </p>
        <p className="relative mt-1.5 text-sm font-semibold text-fg-muted">
          {stars === 3 ? "Gabaritou: a porta está em boas mãos." : stars === 2 ? "Pronto(a) para a porta." : "Pronto(a)! Na dúvida, a faixa da tela sempre diz o que fazer."}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="display text-xl text-fg">Cola da portaria</p>
        <ul className="mt-2 grid gap-1.5">
          {questions.map((question) => (
            <li key={question.id} className="flex items-start gap-2 text-sm leading-snug text-fg-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-success-text" />
              <span>{question.lesson}</span>
            </li>
          ))}
        </ul>
      </div>

      {save === "error" ? (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/50 bg-danger-soft px-3 py-2 text-sm text-fg">
          Não deu para salvar o treino.
          <Button size="sm" variant="outline" onClick={onRetrySave}>
            Tentar de novo
          </Button>
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild={save === "saved"} size="xl" disabled={save !== "saved"} data-testid="training-go">
          {save === "saved" ? (
            <Link href="/portaria">
              <QrCode /> Ir para a portaria
            </Link>
          ) : (
            <span>
              <Loader className="animate-spin-steps" /> Salvando…
            </span>
          )}
        </Button>
        <Button size="xl" variant="outline" onClick={onAgain} data-testid="training-again">
          <Reload /> Treinar de novo
        </Button>
      </div>
    </div>
  );
}
