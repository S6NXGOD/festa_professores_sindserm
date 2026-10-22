"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckDouble, Close, Loader, Trash } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { callAction } from "@/lib/call-action";
import { plural } from "@/lib/plural";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { bulkEmployeesAction } from "@/server/actions/employees";

/** Quem pode ser selecionado na lista que está na tela (quem está dentro da festa fica de fora). */
/** Como a tela chama quem está na lista (com a concordância de "marcado"). */
export interface BulkNoun {
  one: string;
  many: string;
  markedOne: string;
  markedMany: string;
}

export interface BulkItem {
  id: string;
  name: string;
}

interface BulkContext {
  active: boolean;
  setActive: (value: boolean) => void;
  selected: Set<string>;
  selectable: Map<string, string>;
  setMany: (ids: string[], on: boolean) => void;
}

const Context = createContext<BulkContext | null>(null);

function useBulk() {
  const value = useContext(Context);
  if (!value) throw new Error("BulkSelect ausente");
  return value;
}

/**
 * Seleção em massa de colaboradores ou cortesias: "Selecionar vários" liga as
 * caixinhas, a barra de baixo mostra quantos estão marcados e apaga (ou só tira
 * da lista) todos de uma vez. Quem está dentro da festa não entra na seleção.
 */
export function BulkSelect({
  items,
  noun,
  removedView = false,
  children,
}: {
  items: BulkItem[];
  /** "cortesia"/"cortesias" (marcada/marcadas), "colaborador(a)"/"colaboradores" (marcado(a)/marcados). */
  noun: BulkNoun;
  /** Lista dos tirados da lista: só dá para apagar de vez. */
  removedView?: boolean;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const selectable = useMemo(() => new Map(items.map((item) => [item.id, item.name])), [items]);
  // Mudou o filtro ou alguém saiu da lista: vale só o que ainda está na tela.
  const selected = useMemo(() => new Set([...picked].filter((id) => selectable.has(id))), [picked, selectable]);

  function setMany(ids: string[], on: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function changeActive(value: boolean) {
    setActive(value);
    if (!value) setPicked(new Set());
  }

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[role=dialog]")) changeActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <Context.Provider value={{ active, setActive: changeActive, selected, selectable, setMany }}>
      {children}
      {/* Espaço para a barra de baixo não cobrir o fim da lista. */}
      {active ? <div aria-hidden className="h-28" /> : null}
      <BulkActionBar noun={noun} removedView={removedView} />
    </Context.Provider>
  );
}

/** Liga e desliga o modo de seleção. */
export function BulkSelectToggle({ className }: { className?: string }) {
  const { active, setActive, selectable } = useBulk();
  if (selectable.size === 0) return null;
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      size="sm"
      className={className}
      onClick={() => {
        playSound("blip");
        setActive(!active);
      }}
      aria-pressed={active}
      data-testid="bulk-toggle"
    >
      {active ? <Close /> : <CheckDouble />} {active ? "Cancelar seleção" : "Selecionar vários"}
    </Button>
  );
}

/** Caixinha de uma pessoa (só aparece no modo de seleção). */
export function BulkCheckbox({ id, name, blockedReason }: { id: string; name: string; blockedReason?: string }) {
  const { active, selected, setMany } = useBulk();
  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.span
          initial={{ opacity: 0, scale: 0.4, width: 0 }}
          animate={{ opacity: 1, scale: 1, width: "auto" }}
          exit={{ opacity: 0, scale: 0.4, width: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
          className="inline-flex shrink-0"
          title={blockedReason}
        >
          <Checkbox
            checked={!blockedReason && selected.has(id)}
            disabled={Boolean(blockedReason)}
            onCheckedChange={(value) => {
              playSound("blip");
              setMany([id], value === true);
            }}
            aria-label={blockedReason ? `${name}: ${blockedReason}` : `Selecionar ${name}`}
            data-testid="bulk-checkbox"
          />
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** Marca ou desmarca um grupo inteiro (ex.: todas as cortesias de um convite). */
export function BulkGroupCheckbox({ ids, label }: { ids: string[]; label: string }) {
  const { active, selected, selectable, setMany } = useBulk();
  const usable = ids.filter((id) => selectable.has(id));
  if (!active || usable.length === 0) return null;
  const count = usable.filter((id) => selected.has(id)).length;
  return (
    <Checkbox
      checked={count === usable.length ? true : count > 0 ? "indeterminate" : false}
      onCheckedChange={() => {
        playSound("blip");
        setMany(usable, count !== usable.length);
      }}
      aria-label={`Selecionar todo o grupo ${label}`}
      data-testid="bulk-group-checkbox"
    />
  );
}

function outcomeText(outcome: { deleted: string[]; removed: string[]; skipped: { name: string; reason: string }[] }, mode: "delete" | "remove") {
  const parts = [
    outcome.deleted.length ? `${plural(outcome.deleted.length, "pessoa apagada", "pessoas apagadas")} de vez` : null,
    outcome.removed.length
      ? `${plural(outcome.removed.length, "pessoa tirada", "pessoas tiradas")} da lista${mode === "delete" ? " (tinham entrada ou kit no histórico)" : ""}`
      : null,
  ].filter(Boolean);
  const skipped = outcome.skipped.length
    ? `${plural(outcome.skipped.length, "ficou", "ficaram")}: ${outcome.skipped
        .slice(0, 3)
        .map((item) => `${item.name} (${item.reason})`)
        .join("; ")}${outcome.skipped.length > 3 ? "…" : ""}`
    : null;
  return { title: parts.join(" · ") || "Nada mudou", description: skipped ?? undefined };
}

/** A barra de baixo: quantos estão marcados, marcar todos, limpar e apagar. */
function BulkActionBar({ noun, removedView }: { noun: BulkNoun; removedView: boolean }) {
  const { active, setActive, selected, selectable, setMany } = useBulk();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const count = selected.size;
  const allSelected = count > 0 && count === selectable.size;
  const names = [...selected].map((id) => selectable.get(id) ?? "");

  function run(mode: "delete" | "remove") {
    startTransition(async () => {
      const result = await callAction(bulkEmployeesAction({ employeeIds: [...selected], mode }));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        return;
      }
      const { title, description } = outcomeText(result.data, mode);
      playSound(result.data.deleted.length || result.data.removed.length ? "powerup" : "warn");
      if (result.data.skipped.length) toast.warning(title, { description, duration: 9000 });
      else toast.success(title);
      setConfirming(false);
      setActive(false);
    });
  }

  return (
    <>
      <AnimatePresence>
        {active ? (
          <motion.div
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="no-print fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
            data-testid="bulk-bar"
          >
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border-2 border-red/50 bg-ink/95 p-3 shadow-[0_-12px_40px_-12px_var(--glow)] backdrop-blur-md">
              <motion.span
                key={count}
                initial={{ scale: 1.35 }}
                animate={{ scale: 1 }}
                className="display min-w-10 text-center text-3xl leading-none text-fg tabular"
                data-testid="bulk-count"
              >
                {count}
              </motion.span>
              <span className="min-w-0 flex-1 text-sm text-fg-muted">
                {count === 1 ? `${noun.one} ${noun.markedOne}` : `${noun.many} ${noun.markedMany}`}
                <span className="block text-xs">de {selectable.size} na tela</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  playSound("blip");
                  setMany([...selectable.keys()], !allSelected);
                }}
                data-testid="bulk-select-all"
              >
                <CheckDouble /> {allSelected ? "Desmarcar todos" : `Todos (${selectable.size})`}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={count === 0}
                onClick={() => {
                  playSound("warn");
                  setConfirming(true);
                }}
                data-testid="bulk-delete"
              >
                <Trash /> Apagar {count || ""}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Dialog open={confirming} onOpenChange={(value) => !pending && setConfirming(value)}>
        <DialogContent data-testid="bulk-confirm">
          <DialogHeader>
            <DialogTitle>
              Apagar {count === 1 ? `1 ${noun.one}` : `${count} ${noun.many}`}?
            </DialogTitle>
            <DialogDescription>
              Quem nunca entrou nem recebeu kit some de vez, com o voucher (no caso de colaborador(a), o convidado e os convidados sem kit
              dele(a) também). Quem já teve entrada ou kit só sai da lista, com o histórico guardado. Quem está dentro da festa não sai.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border border-line bg-ink/60 px-3 py-2 text-sm text-fg" data-testid="bulk-confirm-names">
            {names.slice(0, 6).join(", ")}
            {names.length > 6 ? ` e mais ${names.length - 6}` : ""}
          </p>
          <p className={cn("text-xs font-semibold text-danger")}>Apagar de vez não dá para desfazer.</p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Cancelar
            </Button>
            {!removedView ? (
              <Button type="button" variant="outline" onClick={() => run("remove")} disabled={pending} data-testid="bulk-remove-only">
                Só tirar da lista
              </Button>
            ) : null}
            <Button type="button" variant="destructive" onClick={() => run("delete")} disabled={pending} data-testid="bulk-confirm-delete">
              {pending ? <Loader className="animate-spin-steps" /> : <Trash />} Apagar de vez
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
