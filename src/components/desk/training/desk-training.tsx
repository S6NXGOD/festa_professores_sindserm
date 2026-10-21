"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeskCard } from "@/components/desk/desk-card";
import { DeskQueueItemRow } from "@/components/desk/queue-row";
import { shuffled } from "@/components/gate/training/scenarios";
import { WalkInStamp } from "@/components/gate/walk-in-stamp";
import { Check, Close, Gamepad, Gift, Info, Loader, MemberCard, Package, QrCode, Reload, Search, Star, Trophy } from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAction } from "@/lib/call-action";
import { vibrate } from "@/lib/haptics";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { finishDeskTrainingAction } from "@/server/actions/users";
import { type DeskMission, type DeskTrainingContext, deskMissions, searchRoster } from "./desk-missions";
import { confettiLook } from "@/lib/confetti-look";

/** Acertou: a próxima pessoa chega sozinha neste tempo (um toque adianta). */
const AUTO_NEXT_MS = 1900;

type Step = "find" | "card" | "crate";
type Answer = { missionId: string; right: boolean; correct: string };

/**
 * Treino da mesa dos kits: pessoas de mentira chegam na mesa e a pessoa do
 * treino faz o que faria de verdade — acha quem chegou, confere o cartão (o
 * mesmo da mesa) e entrega o kit da caixa certa. Nada é gravado; errou, a
 * situação volta no fim. `required`: treino obrigatório antes de abrir a mesa.
 */
export function DeskTraining({ context, required }: { context: DeskTrainingContext; required: boolean }) {
  const router = useRouter();
  const missions = useMemo(() => deskMissions(context), [context]);
  const [stage, setStage] = useState<"intro" | "play" | "done">("intro");
  const [round, setRound] = useState(0);
  const [queue, setQueue] = useState<number[]>([]);
  const [step, setStep] = useState<Step>("find");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [firstTry, setFirstTry] = useState<Record<string, boolean>>({});
  const [combo, setCombo] = useState(0);
  const [stock, setStock] = useState({ official: 120, extra: 30 });
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedOnce = useRef(false);
  const queueRef = useRef<number[]>([]);

  const mission: DeskMission | null = stage === "play" && queue.length ? missions[queue[0]!]! : null;
  const results = mission ? searchRoster(mission.roster, query) : [];
  const order = useMemo(() => shuffled(["right", "wrong"] as const, (queue[0] ?? 0) * 5 + round * 3 + 11), [queue, round]);
  const solved = missions.length - queue.length;
  const rightFirst = Object.values(firstTry).filter(Boolean).length;

  const store = useCallback(async () => {
    setSave("saving");
    const result = await callAction(finishDeskTrainingAction());
    setSave(result.ok ? "saved" : "error");
    if (result.ok) router.refresh();
  }, [router]);

  function start() {
    const all = missions.map((_, index) => index);
    queueRef.current = all;
    setRound((value) => value + 1);
    setQueue(all);
    setStep("find");
    setQuery("");
    setFirstTry({});
    setCombo(0);
    setAnswer(null);
    setStock({ official: 120, extra: 30 });
    setStage("play");
    playSound("coin");
  }

  function settle(right: boolean, correct: string) {
    if (!mission || answer) return;
    setAnswer({ missionId: mission.id, right, correct });
    setFirstTry((seen) => (mission.id in seen ? seen : { ...seen, [mission.id]: right }));
    if (right) {
      setCombo((value) => value + 1);
      playSound(combo + 1 >= 3 ? "powerup" : "coin");
      vibrate([40, 30, 90]);
      if (mission.action.kind === "deliver") {
        const fromExtra = mission.view.kit.kind === "READY" && mission.view.kit.extra;
        setStock((value) => (fromExtra ? { ...value, extra: value.extra - 1 } : { ...value, official: value.official - 1 }));
      }
    } else {
      setCombo(0);
      playSound("error");
      vibrate([80, 60, 80]);
    }
  }

  /** Achou alguém na busca: a pessoa certa abre o cartão; a de nome parecido é erro (conferir!). */
  function pick(personId: string) {
    if (!mission || answer) return;
    if (personId === mission.view.personId) {
      setStep("card");
      playSound(mission.view.entry && mission.view.kit.kind === "READY" ? "blip" : "warn");
      return;
    }
    settle(false, `Era ${mission.view.fullName}: confira o nome completo, o CPF ou o código do voucher antes de abrir.`);
  }

  function deliver() {
    if (!mission || mission.action.kind !== "deliver") return;
    if (mission.action.crate) {
      setStep("crate");
      playSound("blip");
      return;
    }
    settle(true, "");
  }

  /** Passa para a próxima pessoa (só se ainda estiver na mesma: o toque e o tempo não pulam duas). */
  const advance = useCallback(
    (from: Answer) => {
      const list = queueRef.current;
      if (!list.length || missions[list[0]!]!.id !== from.missionId) return;
      const [head, ...rest] = list;
      const next = from.right ? rest : [...rest, head!];
      queueRef.current = next;
      setQueue(next);
      setAnswer(null);
      setStep("find");
      setQuery("");
      if (next.length > 0) return;
      setStage("done");
      playSound("levelup");
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        confetti({ particleCount: 110, spread: 85, origin: { y: 0.55 }, ...confettiLook(["#ff2626", "#ffd23f", "#ffffff", "#22c55e", "#22d3ee"]), flat: true });
      }
      if (!savedOnce.current) {
        savedOnce.current = true;
        void store();
      }
    },
    [missions, store],
  );

  useEffect(() => {
    if (!answer?.right) return;
    const timer = window.setTimeout(() => advance(answer), AUTO_NEXT_MS);
    return () => window.clearTimeout(timer);
  }, [answer, advance]);

  return (
    <div className="mx-auto max-w-lg" data-testid="desk-training">
      {stage === "intro" ? (
        <Intro total={missions.length} required={required} onStart={start} />
      ) : stage === "done" ? (
        <Done missions={missions} rightFirst={rightFirst} save={save} onRetrySave={store} onAgain={start} />
      ) : mission ? (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <PixelTag tone="red">
              <Gamepad className="size-3.5" /> Treino da mesa
            </PixelTag>
            <AnimatePresence mode="popLayout">
              {combo >= 2 ? (
                <motion.span key={combo} initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pixel text-[0.6rem] text-warning">
                  COMBO x{combo}
                </motion.span>
              ) : null}
            </AnimatePresence>
            <span className="pixel text-[0.55rem] text-fg-muted tabular" data-testid="desk-training-progress">
              {solved}/{missions.length}
            </span>
          </div>
          <div className="flex gap-1" aria-hidden>
            {missions.map((item, index) => (
              <span
                key={item.id}
                className={cn(
                  "h-1.5 flex-1 rounded-[2px] transition-colors duration-300",
                  !queue.includes(index) ? "bg-success" : index === queue[0] ? "bg-warning shadow-[0_0_8px_rgb(248_192_0/0.8)]" : "bg-line-strong",
                )}
              />
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg-muted">
            <span className="flex items-center gap-1.5">
              <Package className="size-4 text-red" /> Caixa oficial <strong className="text-fg tabular">{stock.official}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <Package className="size-4 text-[#ffd23f]" /> Gordura <strong className="text-fg tabular">{stock.extra}</strong>
            </span>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${round}-${mission.id}-${queue.length}`}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="space-y-3.5"
              data-testid="desk-training-mission"
              data-mission={mission.id}
            >
              <ArrivalPanel mission={mission} />

              {mission.action.kind === "quick" && !answer ? (
                <QuickStep
                  mission={mission}
                  onDeliver={(right) =>
                    settle(right, "Era o João Pedro Alves (JP26-4XKA): confira o nome e o código do voucher antes de confirmar.")
                  }
                />
              ) : null}

              {step === "find" && !answer && mission.action.kind !== "quick" ? (
                <FindStep mission={mission} query={query} results={results} onQuery={setQuery} onPick={pick} />
              ) : null}

              {mission.action.kind !== "quick" && (step !== "find" || answer?.right) ? (
                <DeskCard
                  view={mission.view}
                  onDeliver={step === "card" && !answer && mission.action.kind === "deliver" ? deliver : undefined}
                  justDelivered={
                    answer?.right && mission.action.kind === "deliver"
                      ? {
                          available: mission.view.kit.kind === "READY" && mission.view.kit.extra ? stock.extra : stock.official,
                          extra: mission.view.kit.kind === "READY" && mission.view.kit.extra,
                          low: false,
                        }
                      : null
                  }
                />
              ) : null}

              {step === "card" && !answer && mission.action.kind === "choose" ? (
                <Choices
                  title="O que você faz?"
                  order={order}
                  right={mission.action.right}
                  wrong={mission.action.wrong}
                  testId="desk-training-choice"
                  onChoose={(right) => settle(right, mission.action.kind === "choose" ? mission.action.right : "")}
                />
              ) : null}

              {step === "crate" && !answer && mission.action.kind === "deliver" && mission.action.crate ? (
                <Crates
                  order={order}
                  right={mission.action.crate.right}
                  wrong={mission.action.crate.wrong}
                  onChoose={(right) => settle(right, mission.action.kind === "deliver" && mission.action.crate ? `${mission.action.crate.right}.` : "")}
                />
              ) : null}

              {answer ? <Feedback answer={answer} lesson={mission.lesson} onNext={() => advance(answer)} /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}

/** O jeito rápido: a fila da mesa de verdade (a mesma linha), com o botão Entregar em cada pessoa. */
function QuickStep({ mission, onDeliver }: { mission: DeskMission; onDeliver: (right: boolean) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-2xl border border-red/40 bg-brand-soft/40 p-3.5" data-testid="desk-training-queue">
      <p className="display text-xl leading-none text-fg">Ele já está na fila da mesa</p>
      <p className="text-sm text-fg-muted">Toque em Entregar na pessoa certa, confira o nome e o voucher e confirme.</p>
      <div className="space-y-2">
        {(mission.queue ?? []).map(({ row, right, fresh }) => (
          <DeskQueueItemRow
            key={row.personId}
            item={row}
            isNew={fresh}
            confirming={open === row.personId}
            onOpen={() => setOpen(row.personId)}
            onQuick={() => {
              setOpen(row.personId);
              playSound("blip");
            }}
            onCancel={() => setOpen(null)}
            onConfirm={() => onDeliver(right)}
            right={right}
          />
        ))}
      </div>
    </div>
  );
}

/** Quem chegou na mesa e o que mostra (voucher ou documento). */
function ArrivalPanel({ mission }: { mission: DeskMission }) {
  const shows = mission.arrival.shows;
  const initials = mission.view.fullName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <p className="pixel text-[0.5rem] text-fg-dim">Chegou na mesa · {mission.title}</p>
      <div className="mt-2 flex items-start gap-3">
        <span className="pixel inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-sm text-fg">{initials}</span>
        <p className="relative min-w-0 flex-1 rounded-xl rounded-tl-none bg-surface-3 px-3 py-2 text-sm font-semibold text-fg">“{mission.arrival.says}”</p>
      </div>
      <div
        className={cn(
          "mt-3 flex items-center gap-3 rounded-xl border-2 px-3 py-2.5",
          shows.kind === "voucher" && shows.walkIn ? "border-[#ffd23f] bg-[#ffd23f]/10" : "border-line-strong bg-ink/50",
        )}
        data-testid="desk-training-shows"
      >
        {shows.kind === "voucher" ? <QrCode className="size-9 shrink-0 text-fg" /> : <MemberCard className="size-9 shrink-0 text-fg" />}
        <div className="min-w-0">
          <p className="text-[0.62rem] font-bold tracking-[0.1em] text-fg-dim uppercase">{shows.kind === "voucher" ? "Mostra o voucher" : "Mostra o documento"}</p>
          <p className="font-mono text-base font-bold text-fg">{shows.kind === "voucher" ? shows.code : `CPF ${shows.cpf}`}</p>
          {shows.kind === "voucher" && shows.walkIn ? <WalkInStamp className="mt-1" /> : null}
        </div>
      </div>
    </div>
  );
}

function FindStep({
  mission,
  query,
  results,
  onQuery,
  onPick,
}: {
  mission: DeskMission;
  query: string;
  results: ReturnType<typeof searchRoster>;
  onQuery: (value: string) => void;
  onPick: (personId: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-red/40 bg-brand-soft/40 p-3.5">
      <p className="display text-xl leading-none text-fg">1. Ache a pessoa</p>
      <p className="text-sm text-fg-muted">Busque pelo nome, CPF ou código do voucher, como na mesa de verdade.</p>
      <label className="relative block">
        <span className="sr-only">Buscar no treino</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-fg-dim" />
        <Input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Nome, CPF ou código do voucher"
          className="h-13 pl-12 text-base"
          autoComplete="off"
          data-testid="desk-training-search"
        />
      </label>
      {!query ? (
        <button
          type="button"
          onClick={() => onQuery(mission.arrival.hint)}
          className="pixel rounded-md border border-dashed border-line-strong px-2 py-1.5 text-[0.55rem] text-fg-muted hover:text-fg"
          data-testid="desk-training-hint"
        >
          Toque para digitar: {mission.arrival.hint}
        </button>
      ) : null}
      {query && results.length === 0 ? <p className="text-sm text-fg-muted">Ninguém com isso. Tente o nome, o CPF ou o código.</p> : null}
      <ul className="space-y-1.5">
        {results.map((person) => (
          <li key={person.personId}>
            <button
              type="button"
              onClick={() => onPick(person.personId)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 text-left hover:border-red/60"
              data-testid="desk-training-result"
              data-right={person.personId === mission.view.personId ? "true" : "false"}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-fg">{person.fullName}</span>
                <span className="block text-xs text-fg-muted">
                  <span className="font-mono">{person.cpf}</span> · <span className="font-mono">{person.voucherCode}</span> ·{" "}
                  {person.entered ? "entrou" : "ainda não entrou"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Choices({
  title,
  order,
  right,
  wrong,
  testId,
  onChoose,
}: {
  title: string;
  order: readonly ("right" | "wrong")[];
  right: string;
  wrong: string;
  testId: string;
  onChoose: (right: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="display text-xl leading-none text-fg">{title}</p>
      {order.map((option) => (
        <Button
          key={option}
          type="button"
          variant="outline"
          size="lg"
          className="h-auto min-h-14 w-full justify-start py-3 text-left whitespace-normal"
          onClick={() => onChoose(option === "right")}
          data-testid={`${testId}-${option}`}
        >
          {option === "right" ? right : wrong}
        </Button>
      ))}
    </div>
  );
}

/** Pegar o kit da caixa certa (gordura ou oficial; kit de menor ou comum). */
function Crates({ order, right, wrong, onChoose }: { order: readonly ("right" | "wrong")[]; right: string; wrong: string; onChoose: (right: boolean) => void }) {
  return (
    <div className="space-y-2">
      <p className="display text-xl leading-none text-fg">2. Pegue o kit da caixa certa</p>
      <div className="grid grid-cols-2 gap-2">
        {order.map((option) => {
          const label = option === "right" ? right : wrong;
          const yellow = /gordura/i.test(label);
          return (
            <motion.button
              key={option}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onChoose(option === "right")}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4 text-center font-bold text-fg outline-none focus-visible:ring-4 focus-visible:ring-red/50",
                yellow ? "border-[#ffd23f] bg-[#ffd23f]/15" : "border-line-strong bg-surface-2",
              )}
              data-testid={`desk-training-crate-${option}`}
            >
              <Package className={cn("size-12", yellow ? "text-[#ffd23f]" : "text-red")} />
              <span className="text-sm leading-tight">{label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function Feedback({ answer, lesson, onNext }: { answer: Answer; lesson: string; onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn("space-y-2 rounded-2xl border-2 p-4", answer.right ? "border-success/60 bg-success-soft" : "border-danger/60 bg-danger-soft")}
      data-testid="desk-training-feedback"
      data-right={answer.right ? "true" : "false"}
    >
      <p className="display flex items-center gap-2 text-2xl leading-none text-fg">
        {answer.right ? <Check className="size-6 text-success-text" /> : <Close className="size-6 text-danger" />}
        {answer.right ? "Isso!" : "Quase"}
      </p>
      {!answer.right && answer.correct ? <p className="text-sm font-bold text-fg">O certo: {answer.correct}</p> : null}
      <p className="text-sm text-fg-muted">{lesson}</p>
      <Button type="button" size="lg" variant={answer.right ? "success" : "light"} className="w-full" onClick={onNext} data-testid="desk-training-next">
        {answer.right ? "Próxima pessoa" : "Entendi"}
      </Button>
    </motion.div>
  );
}

function Intro({ total, required, onStart }: { total: number; required: boolean; onStart: () => void }) {
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border-2 border-red/50 bg-[linear-gradient(150deg,rgb(255_38_38/0.16),rgb(8_8_8/0.9)_60%)] p-5">
        <span className="scanlines pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <p className="pixel relative text-[0.55rem] text-red">Treino da mesa · {total} pessoas</p>
        <h1 className="display relative mt-2 text-4xl leading-none text-fg">Mesa dos kits</h1>
        <p className="relative mt-2 text-sm font-semibold text-fg-muted">
          Pessoas de mentira vão chegar na mesa. Você acha cada uma, confere e entrega o kit, igualzinho à mesa de verdade.
        </p>
        <ol className="relative mt-4 grid gap-2 text-sm text-fg">
          {[
            { icon: Search, text: "Ache a pessoa: nome, CPF ou código do voucher." },
            { icon: Check, text: "Confira: foi validada na entrada? Nome e voucher batem?" },
            { icon: Gift, text: "Entregue o kit da caixa certa. Voucher amarelo = gordura." },
          ].map((rule, index) => (
            <li key={rule.text} className="flex items-start gap-2.5">
              <span className="pixel inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-red text-[0.55rem] text-white">{index + 1}</span>
              <span className="flex items-start gap-1.5">
                <rule.icon className="mt-0.5 size-4 shrink-0 text-red" /> {rule.text}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-red" />
        {required
          ? "Obrigatório antes de abrir a mesa (leva 1 minuto). Nada do treino fica gravado: nenhum kit sai do estoque."
          : "Nada do treino fica gravado: nenhum kit sai do estoque. Repita quantas vezes quiser."}
      </p>
      <Button size="xl" className="w-full" onClick={onStart} data-testid="desk-training-start">
        <Gamepad /> Começar o treino
      </Button>
      {!required ? (
        <Button asChild variant="ghost" className="w-full">
          <Link href="/portaria/mesa">Voltar para a mesa</Link>
        </Button>
      ) : null}
    </div>
  );
}

function Done({
  missions,
  rightFirst,
  save,
  onRetrySave,
  onAgain,
}: {
  missions: DeskMission[];
  rightFirst: number;
  save: "idle" | "saving" | "saved" | "error";
  onRetrySave: () => void;
  onAgain: () => void;
}) {
  const total = missions.length;
  const stars = rightFirst === total ? 3 : rightFirst >= total - 2 ? 2 : 1;
  return (
    <div className="space-y-4" data-testid="desk-training-done">
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
        <p className="display relative mt-2 text-3xl leading-none text-fg" data-testid="desk-training-score">
          {rightFirst} de {total} de primeira
        </p>
        <p className="relative mt-1.5 text-sm font-semibold text-fg-muted">
          {stars === 3 ? "Gabaritou: a mesa está em boas mãos." : "Pronto(a) para a mesa. Na dúvida, a faixa do cartão diz o que fazer."}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="display text-xl text-fg">Cola da mesa</p>
        <ul className="mt-2 grid gap-1.5">
          {missions.map((mission) => (
            <li key={mission.id} className="flex items-start gap-2 text-sm leading-snug text-fg-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-success-text" />
              <span>{mission.lesson}</span>
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
        <Button asChild={save === "saved"} size="xl" disabled={save !== "saved"} data-testid="desk-training-go">
          {save === "saved" ? (
            <Link href="/portaria/mesa">
              <Package /> Ir para a mesa
            </Link>
          ) : (
            <span>
              <Loader className="animate-spin-steps" /> Salvando…
            </span>
          )}
        </Button>
        <Button size="xl" variant="outline" onClick={onAgain} data-testid="desk-training-again">
          <Reload /> Treinar de novo
        </Button>
      </div>
    </div>
  );
}
