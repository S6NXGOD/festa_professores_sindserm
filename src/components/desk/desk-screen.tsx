"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { WalkInStamp } from "@/components/gate/walk-in-stamp";
import { ChevronRight, Gift, Hourglass, Info, Login, Package, QrCode, Search, Target, Users } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAction } from "@/lib/call-action";
import { formatTime } from "@/lib/datetime";
import { vibrate } from "@/lib/haptics";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { deliverAtDeskAction, deskScanAction, deskSearchAction, deskViewAction, type DeskLookup } from "@/server/actions/desk";
import type { DeskStock, DeskView } from "@/server/services/desk";
import type { PersonSearchResult } from "@/server/services/people";
import { useDebouncedSearch } from "@/components/gate/use-debounced-search";
import { DeskCard } from "./desk-card";
import { QrSheet } from "./qr-sheet";

export interface DeskQueueRow {
  personId: string;
  fullName: string;
  isMinor: boolean;
  checkedInAt: string;
  checkedInByName: string;
  roleLabel: string;
  extra: boolean;
  waitlisted: boolean;
}

export interface DeskSnapshot {
  pending: number;
  delivered: number;
  items: DeskQueueRow[];
  stock: DeskStock;
}

const POLL_MS = 6000;
const NUMERIC = /^[\d.\-\s]+$/;

/** Sem CPF completo na tela, a busca por CPF pede os 11 dígitos (o servidor aplica a mesma regra). */
function searchReady(value: string, fullCpf: boolean) {
  const text = value.trim();
  if (NUMERIC.test(text)) {
    const digits = text.replace(/\D/g, "");
    return fullCpf ? digits.length >= 3 : digits.length === 11 || digits.length === 8;
  }
  return text.length >= 2;
}

/**
 * A mesa dos kits: a fila de quem passou pela entrada e ainda não pegou o kit,
 * a busca (nome, CPF ou código do voucher), o QR e o cartão da pessoa com o
 * botão de entregar. A fila se atualiza sozinha.
 */
export function DeskScreen({ initial, fullCpf }: { initial: DeskSnapshot; fullCpf: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DeskView | null>(null);
  const [justDelivered, setJustDelivered] = useState<{ available: number; extra: boolean; low: boolean } | null>(null);
  const [confirmLeftover, setConfirmLeftover] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [delivering, startDelivering] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useCallback((text: string) => deskSearchAction(text), []);
  const { results, loading, run } = useDebouncedSearch<PersonSearchResult>(search);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/portaria/mesa/fila", { cache: "no-store" });
      if (response.ok) setSnapshot((await response.json()) as DeskSnapshot);
    } catch {
      // Sem rede por um instante: a próxima rodada tenta de novo.
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  function show(view: DeskView) {
    setSelected(view);
    setJustDelivered(null);
    setConfirmLeftover(false);
    playSound(view.entry && view.kit.kind === "READY" ? "blip" : "warn");
    vibrate(50);
    window.requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function open(personId: string) {
    setOpening(personId);
    const result = await callAction(deskViewAction(personId));
    setOpening(null);
    if (!result.ok) {
      playSound("error");
      toast.error(result.error);
      return;
    }
    show(result.data);
  }

  const onScan = useCallback(async (text: string) => {
    setQrOpen(false);
    const result = await callAction(deskScanAction(text));
    if (!result.ok) {
      playSound("error");
      toast.error(result.error);
      return;
    }
    const lookup: DeskLookup = result.data;
    if (lookup.kind === "FOUND") {
      setSelected(lookup.view);
      setJustDelivered(null);
      setConfirmLeftover(false);
      playSound(lookup.view.entry && lookup.view.kit.kind === "READY" ? "blip" : "warn");
      return;
    }
    playSound("error");
    vibrate([80, 60, 80]);
    toast.error(
      lookup.kind === "REVOKED"
        ? "Este QR foi cancelado (voucher trocado). Busque a pessoa pelo nome ou CPF."
        : lookup.kind === "NOT_FOUND"
          ? "Este QR não é de nenhuma inscrição. Busque pelo nome ou CPF."
          : "Não é um voucher desta festa. Busque pelo nome ou CPF.",
    );
  }, []);

  const closeQr = useCallback(() => setQrOpen(false), []);

  function deliver(leftover = false) {
    if (!selected) return;
    const personId = selected.personId;
    startDelivering(async () => {
      const result = await callAction(deliverAtDeskAction({ personId, leftover }));
      setConfirmLeftover(false);
      if (!result.ok) {
        playSound("error");
        vibrate([80, 60, 80]);
        toast.error(result.error);
        const fresh = await callAction(deskViewAction(personId));
        if (fresh.ok) setSelected(fresh.data);
        void refresh();
        return;
      }
      playSound("coin");
      vibrate([40, 30, 90]);
      setSelected(result.data.view);
      setJustDelivered({ available: result.data.delivered.available, extra: result.data.delivered.extra, low: result.data.delivered.low });
      if (result.data.delivered.low) toast.warning(`Atenção: restam ${result.data.delivered.available} ${result.data.delivered.extra ? "na gordura" : "na caixa"}.`);
      void refresh();
    });
  }

  function next() {
    setSelected(null);
    setJustDelivered(null);
    setConfirmLeftover(false);
    setQuery("");
    run("", false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => inputRef.current?.focus(), 250);
  }

  const stock = snapshot.stock;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="pixel text-[0.55rem] text-red">Mesa dos kits</p>
          <h1 className="display mt-1 text-4xl leading-none text-fg">Conferir e entregar</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/portaria/mesa/treino" data-testid="desk-open-training">
            <Target /> Treinar
          </Link>
        </Button>
      </header>

      {!stock.kitsAtDesk ? (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg-muted" data-testid="desk-gate-mode">
          <Info className="mt-0.5 size-4 shrink-0 text-red" />
          Hoje os kits saem na portaria, junto com a entrada. Aqui você entrega só quem ficou sem kit na entrada.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="desk-counters">
        <Counter label="Esperando kit" value={snapshot.pending} icon={Hourglass} tone="text-warning" testId="desk-pending" />
        <Counter label="Entregues" value={snapshot.delivered} icon={Gift} tone="text-success-text" />
        <Counter label="Caixa oficial" value={stock.official?.available ?? null} icon={Package} tone={stock.official?.low ? "text-danger" : "text-red"} />
        <Counter label="Gordura" value={stock.extra?.available ?? null} icon={Package} tone={stock.extra?.low ? "text-danger" : "text-[#ffd23f]"} testId="desk-extra" />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <label className="relative block flex-1">
            <span className="sr-only">Buscar por nome, CPF ou código do voucher</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-fg-dim" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                run(event.target.value, searchReady(event.target.value, fullCpf));
              }}
              placeholder="Nome, CPF ou código do voucher"
              className="h-14 pl-12 text-lg"
              autoComplete="off"
              data-testid="desk-search-input"
            />
          </label>
          <Button type="button" size="lg" className="h-14 shrink-0 px-4" onClick={() => setQrOpen(true)} data-testid="desk-scan">
            <QrCode /> <span className="hidden min-[420px]:inline">Ler QR</span>
          </Button>
        </div>
        {!fullCpf ? <p className="px-1 text-xs text-fg-dim">CPF: digite os 11 números.</p> : null}
        {results ? (
          <ul className={cn("space-y-2", loading && "opacity-60")} data-testid="desk-search-results">
            {results.length === 0 ? (
              <li className="rounded-xl border-2 border-dashed border-line px-4 py-5 text-center text-sm text-fg-muted">
                Ninguém encontrado. Confira a grafia, o CPF ou o código do voucher.
              </li>
            ) : (
              results.map((person) => (
                <li key={person.personId}>
                  <button
                    type="button"
                    onClick={() => void open(person.personId)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 text-left outline-none hover:border-red/60 focus-visible:ring-[3px] focus-visible:ring-red/50"
                    data-testid="desk-search-result"
                  >
                    <span
                      className={cn(
                        "inline-flex size-10 shrink-0 items-center justify-center rounded-lg",
                        person.checkedInAt ? "bg-success text-success-foreground" : "bg-surface-3 text-fg-muted",
                      )}
                    >
                      {person.checkedInAt ? <Login className="size-5" /> : <Users className="size-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-fg">{person.fullName}</span>
                      <span className="block text-xs text-fg-muted">
                        <span className="font-mono">{person.cpfDisplay}</span>
                        {person.checkedInAt ? ` · entrou ${formatTime(person.checkedInAt)}` : " · ainda não entrou"}
                      </span>
                    </span>
                    <ChevronRight className={cn("size-5 shrink-0 text-fg-dim", opening === person.personId && "animate-pulse")} />
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      <div ref={cardRef} className="scroll-mt-20">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={`${selected.personId}-${justDelivered ? "ok" : selected.kit.kind}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <DeskCard
                view={selected}
                delivering={delivering}
                justDelivered={justDelivered}
                onDeliver={() => deliver(false)}
                onLeftover={() => setConfirmLeftover(true)}
                onNext={next}
              />
              {confirmLeftover ? (
                <div className="mt-2 space-y-2 rounded-xl border border-warning/50 bg-warning-soft p-3 text-sm text-fg" data-testid="desk-leftover-confirm">
                  <p className="font-semibold">
                    Kit de sobra: só quando a organização liberar. A pessoa sai da fila do kit e o kit sai do estoque agora.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="ghost" onClick={() => setConfirmLeftover(false)}>
                      Cancelar
                    </Button>
                    <Button type="button" onClick={() => deliver(true)} disabled={delivering} data-testid="desk-leftover-yes">
                      Entregar sobra
                    </Button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <section className="space-y-2" data-testid="desk-queue">
        <h2 className="flex items-center gap-2 text-[0.72rem] font-bold tracking-[0.1em] text-fg-muted uppercase">
          <Hourglass className="size-4 text-warning" /> Entraram e ainda não pegaram o kit
          <span className="pixel ml-auto text-[0.55rem] text-fg-dim">ao vivo</span>
        </h2>
        {snapshot.items.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
            Ninguém esperando kit agora. Quem a segurança liberar aparece aqui sozinho.
          </p>
        ) : (
          <ul className="space-y-2">
            {snapshot.items.map((item) => (
              <li key={item.personId}>
                <button
                  type="button"
                  onClick={() => void open(item.personId)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border bg-surface p-3 text-left outline-none hover:border-red/60 focus-visible:ring-[3px] focus-visible:ring-red/50",
                    item.extra ? "border-[#ffd23f]/50" : "border-line",
                  )}
                  data-testid="desk-queue-item"
                >
                  <span className="pixel w-12 shrink-0 text-center text-[0.6rem] text-fg-dim tabular">{formatTime(new Date(item.checkedInAt))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-fg">{item.fullName}</span>
                    <span className="block truncate text-xs text-fg-muted">{item.roleLabel}</span>
                  </span>
                  {item.extra ? <WalkInStamp className="hidden min-[420px]:inline-flex" /> : null}
                  {item.waitlisted ? <span className="pixel rounded bg-surface-3 px-1.5 py-1 text-[0.5rem] text-fg-muted">Fila</span> : null}
                  <ChevronRight className={cn("size-5 shrink-0 text-fg-dim", opening === item.personId && "animate-pulse")} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {snapshot.pending > snapshot.items.length ? (
          <p className="text-center text-xs text-fg-dim">Mostrando os {snapshot.items.length} mais recentes de {snapshot.pending}. Use a busca para os outros.</p>
        ) : null}
      </section>

      {qrOpen ? <QrSheet onResult={onScan} onClose={closeQr} /> : null}
    </div>
  );
}

function Counter({
  label,
  value,
  icon: Icon,
  tone,
  testId,
}: {
  label: string;
  value: number | null;
  icon: typeof Gift;
  tone: string;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5" data-testid={testId}>
      <p className="flex items-center gap-1.5 text-[0.62rem] font-bold tracking-[0.08em] text-fg-muted uppercase">
        <Icon className={cn("size-3.5", tone)} /> {label}
      </p>
      <p className={cn("display mt-0.5 text-3xl leading-none tabular", tone)}>{value === null ? "—" : value}</p>
    </div>
  );
}
