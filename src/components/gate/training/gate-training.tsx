"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  ArrowRight,
  Cancel,
  Check,
  Close,
  Gamepad,
  Heart,
  Keyboard,
  Login,
  QrCode,
  Reload,
  Search,
  Target,
  Trophy,
  UserPlus,
  Warning,
} from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { vibrate } from "@/lib/haptics";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { ConfirmEntryButton, GateResult } from "../gate-result";
import { shuffled, type TrainingContext, type TrainingScenario, trainingScenarios } from "./scenarios";

type Answer = { chosen: number; correct: boolean };

/**
 * Treino da portaria: cada situação mostra a tela de verdade e pergunta o que
 * fazer. Nada aqui grava no sistema (os dados são de mentira).
 */
export function GateTraining({ context }: { context: TrainingContext }) {
  const scenarios = useMemo(() => trainingScenarios(context), [context]);
  const phases = useMemo(() => [...new Set(scenarios.map((s) => s.phase))], [scenarios]);
  const [stage, setStage] = useState<"intro" | "play" | "done">("intro");
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const screenRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const scenario = scenarios[index]!;
  const options = useMemo(() => shuffled(scenario.options, (index + 1) * (round + 3)), [scenario, index, round]);
  const answer = answers[scenario.id] ?? null;
  const score = Object.values(answers).filter((a) => a.correct).length;

  function start() {
    setAnswers({});
    setIndex(0);
    setStage("play");
    playSound("coin");
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function choose(position: number) {
    if (answer) return;
    const option = options[position]!;
    setAnswers((current) => ({ ...current, [scenario.id]: { chosen: position, correct: option.correct } }));
    if (option.correct) {
      const kit = scenario.after?.entryKit;
      playSound(kit?.kind === "DELIVERED" ? (scenario.after?.entryGuestKit ? "fanfare" : "powerup") : "coin");
      vibrate([40, 40, 120]);
    } else {
      playSound("error");
      vibrate([80, 60, 80]);
    }
    // A tela muda para o resultado: volta para ela (o celular costuma estar lá embaixo, nas respostas).
    window.requestAnimationFrame(() => screenRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function next() {
    if (index === scenarios.length - 1) {
      setStage("done");
      const total = Object.values(answers).filter((a) => a.correct).length;
      playSound("levelup");
      if (total / scenarios.length >= 0.8 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        confetti({ particleCount: 110, spread: 85, origin: { y: 0.55 }, colors: ["#ff2626", "#f8c000", "#ffffff", "#ff4fb4", "#22d3ee"], shapes: ["square"], flat: true });
      }
    } else {
      setIndex(index + 1);
      playSound("blip");
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function again() {
    setRound((r) => r + 1);
    start();
  }

  return (
    <div ref={topRef} className="scroll-mt-20" data-testid="gate-training">
      {stage === "intro" ? (
        <Intro total={scenarios.length} phases={phases.map((phase) => ({ phase, count: scenarios.filter((s) => s.phase === phase).length }))} onStart={start} />
      ) : stage === "done" ? (
        <Done scenarios={scenarios} answers={answers} onAgain={again} />
      ) : (
        <div className="space-y-4 pb-36">
          <Progress scenarios={scenarios} index={index} answers={answers} score={score} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${round}-${scenario.id}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              className="space-y-4"
            >
              <p className="flex items-start gap-3 rounded-xl border border-line-strong bg-surface-2 p-3.5 text-[0.95rem] leading-snug font-semibold text-fg" data-testid="training-story">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-red text-white shadow-[0_3px_0_0_var(--brand-strong)]">
                  <Target className="size-5" />
                </span>
                <span className="min-w-0 pt-1">{scenario.story}</span>
              </p>

              <div ref={screenRef} className="scroll-mt-20">
                <p className="pixel mb-2 text-[0.5rem] text-fg-dim">{answer && scenario.after ? "Depois da resposta certa, a tela fica assim" : "A tela da portaria"}</p>
                <TrainingScreenView scenario={scenario} showAfter={Boolean(answer)} />
              </div>

              {answer ? <Feedback scenario={scenario} options={options} answer={answer} /> : null}

              <div role="group" aria-labelledby="training-question" className="space-y-2">
                <p id="training-question" className="display text-2xl text-fg">
                  O que você faz?
                </p>
                {options.map((option, position) => {
                  const chosen = answer?.chosen === position;
                  const reveal = Boolean(answer);
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => choose(position)}
                      disabled={reveal}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left text-[0.95rem] leading-snug font-semibold transition-[border-color,background-color,opacity,transform] outline-none focus-visible:ring-2 focus-visible:ring-red",
                        !reveal && "border-line-strong bg-surface hover:border-red/60 hover:bg-surface-2 active:scale-[0.99]",
                        reveal && option.correct && "border-success bg-success-soft text-fg",
                        reveal && chosen && !option.correct && "border-danger bg-danger-soft text-fg",
                        reveal && !chosen && !option.correct && "border-line opacity-55",
                      )}
                      data-testid={`training-option-${option.correct ? "right" : "wrong"}`}
                    >
                      <span
                        className={cn(
                          "pixel inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[0.6rem]",
                          reveal && option.correct ? "bg-success text-success-foreground" : reveal && chosen ? "bg-danger text-white" : "bg-surface-3 text-fg-muted",
                        )}
                      >
                        {reveal && option.correct ? <Check className="size-4" /> : reveal && chosen ? <Close className="size-4" /> : String.fromCharCode(65 + position)}
                      </span>
                      <span className="min-w-0">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>

          {answer ? (
            <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 px-4 pt-3 backdrop-blur">
              <div className="mx-auto max-w-2xl">
                <Button size="xl" className="w-full" onClick={next} autoFocus data-testid="training-next">
                  {index === scenarios.length - 1 ? (
                    <>
                      <Trophy /> Ver o resultado
                    </>
                  ) : (
                    <>
                      Próxima situação <ArrowRight />
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Intro({ total, phases, onStart }: { total: number; phases: { phase: string; count: number }[]; onStart: () => void }) {
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border-2 border-red/50 bg-[linear-gradient(150deg,rgb(227_0_15/0.22),rgb(8_8_8/0.9)_65%)] p-5">
        <span className="scanlines pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <PixelTag tone="red" className="relative w-fit">
          <Gamepad className="size-3.5" /> Modo treino
        </PixelTag>
        <h1 className="display relative mt-3 text-4xl leading-none text-fg sm:text-5xl">Treino da portaria</h1>
        <p className="relative mt-3 text-[0.95rem] leading-relaxed text-fg-muted">
          {total} situações da porta, com a tela de verdade. Você lê o que aparece e escolhe o que fazer. Leva uns 4 minutos e nada fica gravado
          no sistema: as pessoas são de mentira.
        </p>
        <div className="relative mt-4 grid gap-2 sm:grid-cols-3">
          {phases.map((item, position) => (
            <div key={item.phase} className="rounded-lg border border-line-strong bg-ink/70 px-3 py-2.5">
              <p className="pixel text-[0.5rem] text-red">Fase {position + 1}</p>
              <p className="mt-1 font-bold text-fg">{item.phase}</p>
              <p className="text-xs text-fg-muted">{item.count === 1 ? "1 situação" : `${item.count} situações`}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-2 rounded-xl border border-line bg-surface p-4 text-sm text-fg-muted">
        <p className="flex items-start gap-2">
          <span className="mt-0.5 size-3 shrink-0 rounded-[2px] bg-success" /> <span><strong className="text-fg">Verde</strong>: liberado. Confirme a entrada; o kit sai junto.</span>
        </p>
        <p className="flex items-start gap-2">
          <span className="mt-0.5 size-3 shrink-0 rounded-[2px] bg-warning" /> <span><strong className="text-fg">Amarelo</strong>: falta resolver algo (ou já entrou).</span>
        </p>
        <p className="flex items-start gap-2">
          <span className="mt-0.5 size-3 shrink-0 rounded-[2px] bg-danger" /> <span><strong className="text-fg">Vermelho</strong>: parou. A faixa diz o motivo e o que fazer.</span>
        </p>
      </div>
      <Button size="xl" className="w-full" onClick={onStart} autoFocus data-testid="training-start">
        <Gamepad /> Começar o treino
      </Button>
    </div>
  );
}

function Progress({ scenarios, index, answers, score }: { scenarios: TrainingScenario[]; index: number; answers: Record<string, Answer>; score: number }) {
  const scenario = scenarios[index]!;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <PixelTag tone="red" className="w-fit">
          <Gamepad className="size-3.5" /> {scenario.phase}
        </PixelTag>
        <p className="pixel text-[0.55rem] text-fg-muted tabular" data-testid="training-progress">
          {index + 1}/{scenarios.length} · <span className="text-success-text">{score} acertos</span>
        </p>
      </div>
      <div className="flex gap-1" aria-hidden>
        {scenarios.map((item, position) => {
          const result = answers[item.id];
          return (
            <span
              key={item.id}
              className={cn(
                "h-1.5 flex-1 rounded-[2px] transition-colors duration-300",
                result ? (result.correct ? "bg-success" : "bg-danger") : position === index ? "bg-warning shadow-[0_0_8px_rgb(248_192_0/0.8)]" : "bg-line-strong",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A tela que a pessoa veria na portaria (o cartão é o componente de verdade, com dados de mentira). */
function TrainingScreenView({ scenario, showAfter }: { scenario: TrainingScenario; showAfter: boolean }) {
  const screen = scenario.screen;
  if (showAfter && scenario.after) {
    return (
      <GateResult
        view={scenario.after.view}
        justCheckedIn
        entryKit={scenario.after.entryKit}
        entryGuestKit={scenario.after.entryGuestKit ?? null}
        mode="gate"
      />
    );
  }
  switch (screen.kind) {
    case "card":
      return (
        <div className="space-y-2">
          <GateResult view={screen.view} mode="gate" />
          {screen.view.entry.kind === "ALLOWED" ? (
            // No leitor, este botão fica fixo embaixo da tela.
            <div inert className="rounded-2xl border border-dashed border-line-strong p-2">
              <ConfirmEntryButton view={screen.view} confirming={false} onConfirm={() => undefined} className="w-full" />
              <p className="mt-1.5 text-center text-[0.7rem] text-fg-dim">No leitor, este botão fica fixo embaixo da tela.</p>
            </div>
          ) : null}
        </div>
      );
    case "early":
      return (
        <div className="relative">
          <GateResult view={screen.view} mode="gate" />
          <div className="absolute inset-0 flex items-end justify-center rounded-2xl bg-black/65 p-3 backdrop-blur-[2px]" inert>
            <div className="w-full max-w-md rounded-xl border border-line-strong bg-surface-2 p-4 shadow-2xl">
              <PixelTag tone="warning" className="w-fit">
                <AlarmClock className="size-3.5" /> Ainda não abriu
              </PixelTag>
              <p className="mt-2 text-lg font-bold text-fg">A festa ainda não começou</p>
              <p className="mt-1 text-sm text-fg-muted">
                Começa {screen.view.eventStart.label ?? "no horário marcado"} (faltam 20 minutos). A regra é registrar entradas só a partir desse
                horário.
              </p>
              <p className="mt-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-fg">
                Registrar a entrada de <strong>{screen.view.fullName}</strong> mesmo assim? Os kits saem normalmente e fica anotado na auditoria que a
                entrada foi antes do horário.
              </p>
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" className="border-warning/60 text-warning">
                  <Login /> Registrar mesmo assim
                </Button>
                <Button variant="light">Esperar o horário</Button>
              </div>
            </div>
          </div>
        </div>
      );
    case "problem":
      return (
        <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface" role="img" aria-label={screen.title}>
          <div className="hazard bg-danger px-5 py-6 text-white">
            <div className="flex items-center gap-4">
              <span className="inline-flex size-14 items-center justify-center rounded-xl bg-black/20">
                <Cancel className="size-9" />
              </span>
              <div>
                <p className="pixel text-[0.55rem] opacity-80">Game over</p>
                <p className="display mt-1 text-3xl leading-none">{screen.title}</p>
              </div>
            </div>
            <p className="mt-3 text-sm font-bold">{screen.detail}</p>
          </div>
          <div className="p-5" inert>
            <Button variant="outline" size="lg" className="w-full">
              <Search /> Buscar pessoa manualmente
            </Button>
          </div>
        </div>
      );
    case "scanner":
      return (
        <div className="overflow-hidden rounded-2xl border border-line-strong bg-ink" inert>
          <div className="relative flex h-56 items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#1d1d22,#050505)]">
            <span className="scanlines absolute inset-0 opacity-50" aria-hidden />
            <div className="relative size-36 rounded-2xl">
              {["top-0 left-0 border-t-4 border-l-4", "top-0 right-0 border-t-4 border-r-4", "bottom-0 left-0 border-b-4 border-l-4", "right-0 bottom-0 border-r-4 border-b-4"].map((corner) => (
                <span key={corner} className={cn("absolute size-8 border-red drop-shadow-[0_0_8px_var(--red)]", corner)} aria-hidden />
              ))}
              <span className="absolute inset-0 flex items-center justify-center text-fg-dim">
                <Warning className="size-10" />
              </span>
            </div>
            <p className="pixel absolute inset-x-0 bottom-4 text-center text-[0.5rem] text-fg">Sem QR para ler</p>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
            <Button variant="secondary" size="lg">
              <Search /> Buscar nome/CPF
            </Button>
            <Button variant="secondary" size="lg">
              <Keyboard /> Digitar código
            </Button>
          </div>
        </div>
      );
    case "search":
      return (
        <div className="space-y-3 rounded-2xl border border-line-strong bg-surface p-4" inert>
          <div className="flex h-12 items-center gap-2 rounded-lg border border-line-strong bg-ink px-3 text-fg">
            <Search className="size-5 text-fg-dim" />
            <span className="truncate">{screen.query}</span>
          </div>
          <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-line px-6 py-6 text-center">
            <Search className="size-8 text-fg-dim" />
            <p className="display mt-2 text-xl text-fg">Ninguém encontrado</p>
            <p className="text-sm text-fg-muted">Confira a grafia ou tente pelo CPF.</p>
            <SearchActions register={screen.register} courtesy={screen.courtesy} />
          </div>
        </div>
      );
  }
}

/** Os botões da busca vazia, como a pessoa vê na portaria (dependem do acesso dela). */
function SearchActions({ register, courtesy }: { register: boolean; courtesy: boolean }) {
  if (!register && !courtesy) return <p className="mt-3 text-xs text-fg-dim">Chegou sem inscrição? Chame o Atendimento para o cadastro rápido.</p>;
  return (
    <div className="mt-4 grid w-full max-w-xs gap-1.5">
      {register ? (
        <>
          <Button size="lg">
            <UserPlus /> Cadastrar agora
          </Button>
          <span className="text-xs text-fg-dim">Cadastro rápido de quem chegou sem inscrição</span>
        </>
      ) : null}
      {courtesy ? (
        <Button size="lg" variant={register ? "outline" : "default"} className={cn(register && "mt-1.5")}>
          <Heart className="text-[#ff8fd0]" /> Entrar como cortesia
        </Button>
      ) : null}
    </div>
  );
}

function Feedback({ scenario, options, answer }: { scenario: TrainingScenario; options: TrainingScenario["options"]; answer: Answer }) {
  const chosen = options[answer.chosen]!;
  const right = options.find((option) => option.correct)!;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className={cn(
        "rounded-xl border-2 p-4 text-[0.95rem] leading-snug text-fg",
        answer.correct ? "border-success/70 bg-success-soft" : "border-danger/70 bg-danger-soft",
      )}
      role="status"
      data-testid="training-feedback"
    >
      <p className={cn("pixel flex items-center gap-1.5 text-[0.55rem]", answer.correct ? "text-success-text" : "text-danger")}>
        {answer.correct ? <Check className="size-4" /> : <Close className="size-4" />}
        {answer.correct ? "Acertou" : "Não foi dessa vez"}
      </p>
      <p className="mt-1.5">{chosen.why}</p>
      {!answer.correct ? (
        <p className="mt-2 rounded-lg border border-success/50 bg-success-soft px-3 py-2">
          <strong>O certo:</strong> {right.label}. {right.why.replace(/^Isso! /, "")}
        </p>
      ) : null}
      <p className="mt-3 inline-flex items-start gap-2 rounded-md bg-ink/60 px-2.5 py-1.5 text-sm font-bold text-warning">
        <Warning className="mt-0.5 size-4 shrink-0" /> {scenario.lesson}
      </p>
    </motion.div>
  );
}

function Done({ scenarios, answers, onAgain }: { scenarios: TrainingScenario[]; answers: Record<string, Answer>; onAgain: () => void }) {
  const score = scenarios.filter((s) => answers[s.id]?.correct).length;
  const total = scenarios.length;
  const ratio = score / total;
  const rank = ratio === 1 ? "Gabaritou! A porta está em boas mãos." : ratio >= 0.8 ? "Pronto(a) para a porta." : "Vale treinar mais uma vez.";
  return (
    <div className="space-y-5" data-testid="training-done">
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
        <p className="pixel relative mt-3 text-[0.55rem] text-warning">Treino concluído</p>
        <p className="display relative mt-2 text-4xl leading-none text-fg" data-testid="training-score">
          {score} de {total}
        </p>
        <p className="relative mt-2 font-semibold text-fg-muted">{rank}</p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="display text-2xl text-fg">Cola da portaria</p>
        <p className="text-sm text-fg-muted">A regra de cada situação. As que você errou estão marcadas.</p>
        <ul className="mt-3 grid gap-2">
          {scenarios.map((s) => {
            const missed = answers[s.id] && !answers[s.id]!.correct;
            return (
              <li key={s.id} className={cn("flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm", missed ? "bg-danger-soft text-fg" : "text-fg-muted")}>
                {missed ? <Close className="mt-0.5 size-4 shrink-0 text-danger" /> : <Check className="mt-0.5 size-4 shrink-0 text-success-text" />}
                <span>{s.lesson}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="xl" variant="outline" onClick={onAgain} data-testid="training-again">
          <Reload /> Treinar de novo
        </Button>
        <Button asChild size="xl">
          <Link href="/portaria">
            <QrCode /> Ir para a portaria
          </Link>
        </Button>
      </div>
    </div>
  );
}
