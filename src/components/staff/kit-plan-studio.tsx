"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CountUp } from "@/components/count-up";
import {
  Building,
  Coins,
  Copy,
  Gift,
  Heart,
  Hourglass,
  List,
  Loader,
  Minus,
  Package,
  Plus,
  Save,
  Teach,
  Trash,
  Users,
  Wallet,
  Whatsapp,
} from "@/components/icons/pixel";
import { Panel } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  emptyKitPlan,
  formatCents,
  KIT_KIND_LABEL,
  KIT_KINDS,
  type KitCounts,
  type KitKind,
  type KitLine,
  type KitPlan,
  kitCost,
  kitPlanTotals,
  linesFor,
  MAX_ITEM_QUANTITY,
  MAX_KIT_ITEMS,
  parsePrice,
  shoppingListText,
} from "@/domain/kit-plan";
import { callAction } from "@/lib/call-action";
import { copyText } from "@/lib/clipboard";
import { plural } from "@/lib/plural";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { uuidv4 } from "@/lib/uuid";
import { updateKitPlanAction } from "@/server/actions/setup";

const KIND_ICON: Record<KitKind, typeof Gift> = { MEMBER: Teach, GUEST: Users, EMPLOYEE: Building, EMPLOYEE_GUEST: Users, COURTESY: Heart };
/** Itens comuns de consumação (atalhos; dá para escrever qualquer outro). */
const SUGGESTIONS = ["Cerveja", "Refrigerante", "Água", "Suco", "Espetinho", "Ficha de comida"];

function addCounts(a: KitCounts, b: KitCounts): KitCounts {
  const sum = (x: Record<KitKind, number>, y: Record<KitKind, number>) =>
    Object.fromEntries(KIT_KINDS.map((kind) => [kind, x[kind] + y[kind]])) as Record<KitKind, number>;
  return { kits: sum(a.kits, b.kits), minors: sum(a.minors, b.minors) };
}

/**
 * Montagem e custo dos kits: o que vem em cada kit (quem edita Configurações
 * monta; os outros só veem) e a conta ao vivo — previsto com os inscritos,
 * com a fila do kit e o que já saiu —, com a lista de compras pronta para mandar.
 */
export function KitPlanStudio({
  initialPlan,
  counts,
  canEdit,
  eventName,
}: {
  initialPlan: KitPlan | null;
  counts: { forecast: KitCounts; waitlist: KitCounts; delivered: KitCounts };
  canEdit: boolean;
  eventName: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<KitPlan>(initialPlan ?? emptyKitPlan());
  const [saved, setSaved] = useState(() => JSON.stringify(initialPlan ?? emptyKitPlan()));
  const [pending, startTransition] = useTransition();
  const [withQueue, setWithQueue] = useState(false);
  const dirty = JSON.stringify(plan) !== saved;

  const forecast = useMemo(() => kitPlanTotals(plan, counts.forecast), [plan, counts.forecast]);
  const queue = useMemo(() => kitPlanTotals(plan, counts.waitlist), [plan, counts.waitlist]);
  const delivered = useMemo(() => kitPlanTotals(plan, counts.delivered), [plan, counts.delivered]);
  const shopping = useMemo(
    () => (withQueue ? kitPlanTotals(plan, addCounts(counts.forecast, counts.waitlist)) : forecast),
    [withQueue, plan, counts.forecast, counts.waitlist, forecast],
  );
  const hasItems = plan.items.length > 0 && linesFor(plan, "MEMBER").length > 0;
  const hasPrices = plan.items.some((item) => item.priceCents !== null);

  function save() {
    const names = plan.items.map((item) => item.name.trim().toLocaleLowerCase("pt-BR"));
    if (names.some((name) => !name)) {
      playSound("error");
      toast.error("Todo item precisa de um nome.");
      return;
    }
    if (new Set(names).size !== names.length) {
      playSound("error");
      toast.error("Há itens com o mesmo nome.");
      return;
    }
    startTransition(async () => {
      const result = await callAction(updateKitPlanAction(plan));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        return;
      }
      playSound("powerup");
      setSaved(JSON.stringify(plan));
      toast.success("Kit montado! A conta já vale para todo mundo.");
      router.refresh();
    });
  }

  async function share(kind: "copy" | "whatsapp") {
    const text = shoppingListText(shopping, `Lista de compras da consumação — ${eventName}${withQueue ? " (com a fila do kit)" : ""}`);
    if (kind === "whatsapp") {
      playSound("coin");
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      return;
    }
    const ok = await copyText(text);
    playSound(ok ? "blip" : "error");
    if (ok) toast.success("Lista copiada.");
    else toast.error("Não deu para copiar neste aparelho.");
  }

  return (
    <div className="space-y-6">
      {/* Quanto custa: a conta ao vivo (muda enquanto o kit é montado). */}
      <section className="grid gap-3 sm:grid-cols-3" data-testid="kit-cost-summary">
        <CostCard
          label="Previsto"
          hint={`${plural(forecast.kits, "kit", "kits")} com os inscritos de agora`}
          cents={forecast.totalCents}
          kits={forecast.kits}
          showMoney={hasPrices}
          tone="brand"
          testId="kit-cost-forecast"
        />
        <CostCard
          label="Com a fila do kit"
          hint={queue.kits ? `+ ${plural(queue.kits, "kit", "kits")} se a fila toda ganhar` : "Ninguém na fila"}
          cents={queue.totalCents}
          kits={queue.kits}
          showMoney={hasPrices}
          tone="warning"
          plus
          testId="kit-cost-queue"
        />
        <CostCard
          label="Já entregue"
          hint={`${plural(delivered.kits, "kit saiu", "kits saíram")} até agora`}
          cents={delivered.totalCents}
          kits={delivered.kits}
          showMoney={hasPrices}
          tone="success"
          testId="kit-cost-delivered"
        />
      </section>
      {!hasItems ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted" data-testid="kit-plan-empty">
          {canEdit
            ? "Monte o kit logo abaixo: os itens, quanto vem de cada um e o preço. A conta aparece na hora."
            : "O kit ainda não foi montado. Quem cuida das Configurações monta aqui mesmo."}
        </p>
      ) : forecast.missingPrice || (!hasPrices && canEdit) ? (
        <p className="text-xs text-warning">Falta o preço de algum item: o total em R$ fica incompleto.</p>
      ) : null}

      {hasItems ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Panel title="Por tipo de kit" icon={Package}>
            <ul className="divide-y divide-line" data-testid="kit-cost-kinds">
              {forecast.kinds
                .filter((kind) => kind.kits > 0 || kind.kind === "MEMBER")
                .map((kind) => {
                  const Icon = KIND_ICON[kind.kind];
                  return (
                    <li key={kind.kind} className="flex items-center gap-3 py-3">
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-muted">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-fg">{KIT_KIND_LABEL[kind.kind]}</p>
                        <p className="text-xs text-fg-muted tabular">
                          {plural(kind.kits, "kit", "kits")}
                          {hasPrices ? ` × ${formatCents(kind.unitCents)}` : ""}
                          {kind.minors ? ` · ${kind.minors} de menor${kind.minorUnitCents !== null && hasPrices ? ` (${formatCents(kind.minorUnitCents)})` : ""}` : ""}
                        </p>
                      </div>
                      {hasPrices ? <span className="display text-xl text-fg tabular">{formatCents(kind.subtotalCents)}</span> : null}
                    </li>
                  );
                })}
            </ul>
          </Panel>

          <Panel
            title="Lista de compras"
            icon={List}
            action={
              <label className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
                <Switch checked={withQueue} onCheckedChange={setWithQueue} disabled={!queue.kits} data-testid="shopping-with-queue" /> Com a fila
              </label>
            }
          >
            <ul className="space-y-1.5" data-testid="shopping-list">
              {shopping.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 odd:bg-white/[0.03]">
                  <span className="min-w-0 truncate font-semibold text-fg">{item.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="display text-xl text-fg tabular">
                      <CountUp value={item.quantity} />
                    </span>
                    {item.priceCents !== null ? <span className="ml-2 text-xs text-fg-muted tabular">{formatCents(item.costCents)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button variant="success" onClick={() => void share("whatsapp")} data-testid="shopping-whatsapp">
                <Whatsapp /> Mandar no WhatsApp
              </Button>
              <Button variant="outline" onClick={() => void share("copy")} data-testid="shopping-copy">
                <Copy /> Copiar a lista
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}

      {canEdit ? (
        <KitEditor plan={plan} onChange={setPlan} dirty={dirty} pending={pending} onSave={save} />
      ) : hasItems ? (
        <Panel title="O que vem em cada kit" icon={Gift}>
          <KitContents plan={plan} />
        </Panel>
      ) : null}
    </div>
  );
}

function CostCard({
  label,
  hint,
  cents,
  kits,
  showMoney,
  tone,
  plus = false,
  testId,
}: {
  label: string;
  hint: string;
  cents: number;
  kits: number;
  showMoney: boolean;
  tone: "brand" | "warning" | "success";
  plus?: boolean;
  testId: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-b from-surface to-ink-2 p-4",
        tone === "brand" ? "border-red/40" : tone === "warning" ? "border-warning/40" : "border-success/40",
      )}
    >
      <p className="flex items-center gap-1.5 text-[0.7rem] font-bold tracking-[0.1em] text-fg-muted uppercase">
        {tone === "warning" ? <Hourglass className="size-4 text-warning" /> : tone === "success" ? <Wallet className="size-4 text-success-text" /> : <Coins className="size-4 text-red" />}
        {label}
      </p>
      <p className="display mt-2 text-4xl leading-none text-fg tabular" data-testid={testId}>
        {showMoney ? `${plus && cents ? "+ " : ""}${formatCents(cents)}` : <CountUp value={kits} />}
      </p>
      <p className="mt-1.5 text-xs text-fg-muted">{showMoney ? hint : `${hint} (sem preço)`}</p>
    </div>
  );
}

/** Só leitura: o que vem em cada kit. */
function KitContents({ plan }: { plan: KitPlan }) {
  return (
    <ul className="space-y-2">
      {KIT_KINDS.map((kind) => (
        <li key={kind} className="text-sm">
          <span className="font-semibold text-fg">{KIT_KIND_LABEL[kind]}:</span>{" "}
          <span className="text-fg-muted">{describe(plan, linesFor(plan, kind))}</span>
        </li>
      ))}
      {plan.minor ? (
        <li className="text-sm">
          <span className="font-semibold text-fg">Menor de 18:</span> <span className="text-fg-muted">{describe(plan, plan.minor)}</span>
        </li>
      ) : null}
    </ul>
  );
}

function describe(plan: KitPlan, lines: KitLine[]) {
  const parts = lines
    .filter((line) => line.quantity > 0)
    .map((line) => `${line.quantity}× ${plan.items.find((item) => item.id === line.itemId)?.name ?? "?"}`);
  return parts.length ? parts.join(" · ") : "nada";
}

/** Montar o kit: itens (com preço), o kit da professora e do professor e os outros (iguais ou diferentes). */
function KitEditor({
  plan,
  onChange,
  dirty,
  pending,
  onSave,
}: {
  plan: KitPlan;
  onChange: (plan: KitPlan) => void;
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  const [priceText, setPriceText] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.items.map((item) => [item.id, item.priceCents === null ? "" : (item.priceCents / 100).toFixed(2).replace(".", ",")])),
  );
  const [badPrice, setBadPrice] = useState<Record<string, boolean>>({});

  function addItem(name = "") {
    if (plan.items.length >= MAX_KIT_ITEMS) return;
    if (name && plan.items.some((item) => item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return;
    playSound("blip");
    const id = uuidv4();
    // Item novo já entra no kit da professora e do professor (1 unidade).
    onChange({ ...plan, items: [...plan.items, { id, name, priceCents: null }], kits: { ...plan.kits, MEMBER: [...plan.kits.MEMBER, { itemId: id, quantity: 1 }] } });
    if (!name) window.setTimeout(() => document.getElementById(`kit-item-${id}`)?.focus(), 50);
  }

  function removeItem(id: string) {
    playSound("blip");
    const strip = (lines: KitLine[] | null) => (lines ? lines.filter((line) => line.itemId !== id) : null);
    onChange({
      items: plan.items.filter((item) => item.id !== id),
      kits: {
        MEMBER: strip(plan.kits.MEMBER) ?? [],
        GUEST: strip(plan.kits.GUEST),
        EMPLOYEE: strip(plan.kits.EMPLOYEE),
        EMPLOYEE_GUEST: strip(plan.kits.EMPLOYEE_GUEST),
        COURTESY: strip(plan.kits.COURTESY),
      },
      minor: strip(plan.minor),
    });
  }

  function setItem(id: string, patch: Partial<KitPlan["items"][number]>) {
    onChange({ ...plan, items: plan.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  }

  function setPrice(id: string, text: string) {
    setPriceText((current) => ({ ...current, [id]: text }));
    const cents = parsePrice(text);
    const bad = Number.isNaN(cents);
    setBadPrice((current) => ({ ...current, [id]: bad }));
    if (!bad) setItem(id, { priceCents: cents });
  }

  const quantityOf = (lines: KitLine[], itemId: string) => lines.find((line) => line.itemId === itemId)?.quantity ?? 0;
  const withQuantity = (lines: KitLine[], itemId: string, quantity: number) => {
    const others = lines.filter((line) => line.itemId !== itemId);
    return quantity > 0 ? [...others, { itemId, quantity }] : others;
  };

  return (
    <Panel title="Monte o kit" icon={Gift} tone="red">
      <div className="space-y-6" data-testid="kit-editor">
        {/* 1. Itens */}
        <section>
          <p className="pixel text-[0.55rem] text-red">1 · Itens da consumação</p>
          <p className="mt-1 text-sm text-fg-muted">O que entra nos kits e quanto custa cada unidade (o preço é opcional).</p>
          <ul className="mt-3 space-y-2">
            <AnimatePresence initial={false}>
              {plan.items.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2"
                >
                  <Input
                    id={`kit-item-${item.id}`}
                    value={item.name}
                    placeholder="Ex.: Cerveja"
                    maxLength={40}
                    onChange={(event) => setItem(item.id, { name: event.target.value })}
                    aria-label="Nome do item"
                    data-testid="kit-item-name"
                  />
                  <Input
                    value={priceText[item.id] ?? ""}
                    placeholder="R$ 0,00"
                    inputMode="decimal"
                    onChange={(event) => setPrice(item.id, event.target.value)}
                    aria-label={`Preço de ${item.name || "item"}`}
                    aria-invalid={badPrice[item.id] ?? false}
                    className={cn("text-right tabular", badPrice[item.id] && "border-danger")}
                    data-testid="kit-item-price"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(item.id)} aria-label={`Tirar ${item.name || "item"}`}>
                    <Trash />
                  </Button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => addItem()} disabled={plan.items.length >= MAX_KIT_ITEMS} data-testid="kit-add-item">
              <Plus /> Item
            </Button>
            {SUGGESTIONS.filter((name) => !plan.items.some((item) => item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => addItem(name)}
                className="rounded-md border border-dashed border-line-strong px-2.5 py-1 text-xs font-semibold text-fg-muted transition-colors hover:border-red/60 hover:text-fg"
              >
                + {name}
              </button>
            ))}
          </div>
        </section>

        {plan.items.length ? (
          <>
            {/* 2. O kit da professora e do professor (a base dos outros) */}
            <KindCard
              kind="MEMBER"
              plan={plan}
              lines={plan.kits.MEMBER}
              onLines={(lines) => onChange({ ...plan, kits: { ...plan.kits, MEMBER: lines ?? [] } })}
              quantityOf={quantityOf}
              withQuantity={withQuantity}
            />
            {/* 3. Os outros kits: iguais ao da professora e do professor, ou diferentes */}
            {KIT_KINDS.filter((kind) => kind !== "MEMBER").map((kind) => (
              <KindCard
                key={kind}
                kind={kind}
                plan={plan}
                lines={plan.kits[kind]}
                onLines={(lines) => onChange({ ...plan, kits: { ...plan.kits, [kind]: lines } })}
                quantityOf={quantityOf}
                withQuantity={withQuantity}
                sameLabel="Igual ao kit da professora e do professor"
              />
            ))}
            {/* 4. Menor de 18 (ex.: kit sem bebida alcoólica) */}
            <KindCard
              kind="MINOR"
              plan={plan}
              lines={plan.minor}
              onLines={(lines) => onChange({ ...plan, minor: lines })}
              quantityOf={quantityOf}
              withQuantity={withQuantity}
              sameLabel="Menor de 18 recebe o mesmo kit"
            />
          </>
        ) : null}

        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-line-strong bg-ink/95 p-3 backdrop-blur">
          <p className="text-xs text-fg-muted">{dirty ? "Alterações não salvas: a conta acima já mostra como fica." : "Tudo salvo."}</p>
          <Button onClick={onSave} disabled={!dirty || pending} data-testid="kit-plan-save">
            {pending ? <Loader className="animate-spin-steps" /> : <Save />} Salvar o kit
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function KindCard({
  kind,
  plan,
  lines,
  onLines,
  quantityOf,
  withQuantity,
  sameLabel,
}: {
  kind: KitKind | "MINOR";
  plan: KitPlan;
  /** null = igual ao kit da professora e do professor. */
  lines: KitLine[] | null;
  onLines: (lines: KitLine[] | null) => void;
  quantityOf: (lines: KitLine[], itemId: string) => number;
  withQuantity: (lines: KitLine[], itemId: string, quantity: number) => KitLine[];
  sameLabel?: string;
}) {
  const custom = lines !== null;
  const shown = lines ?? plan.kits.MEMBER;
  const cost = kitCost(plan, shown.filter((line) => line.quantity > 0));
  const Icon = kind === "MINOR" ? Hourglass : KIND_ICON[kind];
  const title = kind === "MINOR" ? "Menor de 18 anos" : `Kit · ${KIT_KIND_LABEL[kind]}`;

  return (
    <section className={cn("rounded-xl border p-3.5", custom || kind === "MEMBER" ? "border-line-strong bg-surface-2" : "border-line bg-surface")} data-testid={`kit-kind-${kind.toLowerCase()}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-bold text-fg">
          <Icon className="size-4 text-red" /> {title}
        </p>
        <span className="pixel text-[0.5rem] text-fg-dim">
          {plan.items.some((item) => item.priceCents !== null) ? `${formatCents(cost.cents)} por kit` : ""}
        </span>
      </div>
      {sameLabel ? (
        <label className="mt-2 flex items-center justify-between gap-3 text-sm text-fg-muted">
          {sameLabel}
          <Switch
            checked={!custom}
            onCheckedChange={(same) => {
              playSound("blip");
              // Ao separar, começa com o kit da professora e do professor para só ajustar.
              onLines(same ? null : plan.kits.MEMBER.map((line) => ({ ...line })));
            }}
            data-testid={`kit-same-${kind.toLowerCase()}`}
          />
        </label>
      ) : null}
      {custom || kind === "MEMBER" ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {plan.items.map((item) => {
            const quantity = quantityOf(shown, item.id);
            return (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink/50 px-2.5 py-1.5">
                <span className={cn("min-w-0 truncate text-sm font-semibold", quantity ? "text-fg" : "text-fg-dim")}>{item.name || "Item sem nome"}</span>
                <Stepper
                  value={quantity}
                  onChange={(next) => onLines(withQuantity(shown, item.id, next))}
                  label={`${item.name || "item"} no ${title}`}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-fg-dim">{describe(plan, plan.kits.MEMBER)}</p>
      )}
    </section>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const set = (next: number) => {
    const clamped = Math.max(0, Math.min(MAX_ITEM_QUANTITY, next));
    if (clamped === value) return;
    playSound("blip");
    onChange(clamped);
  };
  return (
    <span className="flex shrink-0 items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value === 0}
        className="inline-flex size-8 items-center justify-center rounded-md border border-line-strong text-fg transition-transform active:scale-90 disabled:opacity-30"
        aria-label={`Menos ${label}`}
      >
        <Minus className="size-4" />
      </button>
      <span className="display w-7 text-center text-lg text-fg tabular" data-testid="kit-quantity">
        {value}
      </span>
      <button
        type="button"
        onClick={() => set(value + 1)}
        className="inline-flex size-8 items-center justify-center rounded-md border border-red/60 bg-brand-soft text-fg transition-transform active:scale-90"
        aria-label={`Mais ${label}`}
      >
        <Plus className="size-4" />
      </button>
    </span>
  );
}
