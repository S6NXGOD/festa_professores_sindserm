"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CountUp } from "@/components/count-up";
import {
  Building,
  Close,
  Coins,
  Copy,
  Gift,
  Heart,
  Hourglass,
  List,
  Loader,
  Minus,
  Package,
  Pencil,
  Plus,
  Save,
  Teach,
  Trash,
  Users,
  Wallet,
  Warning,
  Whatsapp,
} from "@/components/icons/pixel";
import { Panel } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  alcoholItems,
  emptyKitPlan,
  formatCents,
  KIT_KIND_LABEL,
  KIT_KINDS,
  type KitCounts,
  type KitKind,
  type KitLine,
  type KitPlan,
  kitCost,
  kitGroups,
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
/** Nome curto de quem recebe cada kit (nos tíquetes). */
const KIND_SHORT: Record<KitKind, string> = {
  MEMBER: "Professoras e professores",
  GUEST: "Convidados delas e deles",
  EMPLOYEE: "Colaboradores",
  EMPLOYEE_GUEST: "Convidados dos colaboradores",
  COURTESY: "Cortesias",
};
/** Itens comuns de consumação (atalhos; dá para escrever qualquer outro). */
const SUGGESTIONS = ["Cerveja", "Refrigerante", "Água", "Suco", "Espetinho", "Ficha de comida"];

function addCounts(a: KitCounts, b: KitCounts): KitCounts {
  const sum = (x: Record<KitKind, number>, y: Record<KitKind, number>) =>
    Object.fromEntries(KIT_KINDS.map((kind) => [kind, x[kind] + y[kind]])) as Record<KitKind, number>;
  return { kits: sum(a.kits, b.kits), minors: sum(a.minors, b.minors) };
}

/**
 * Montagem e custo dos kits. Primeiro, como é cada kit (desenhado como um
 * tíquete); depois, para quem edita Configurações, a montagem em três fases (o
 * que vem no kit, se os outros kits são iguais e o kit de menor de 18); por
 * último, a conta: quanto comprar de cada item e quanto custa.
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
  // Primeira vez (kit vazio): a montagem já abre. Depois, fica a um toque ("Mudar o kit").
  const [editing, setEditing] = useState(() => canEdit && !(initialPlan && linesFor(initialPlan, "MEMBER").length));
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
      {/* 1. Como é o kit: um tíquete para cada kit diferente. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="pixel text-[0.55rem] text-red">Como é o kit</p>
            <h2 className="display mt-1 text-[1.6rem] leading-none text-fg">{hasItems ? "Os kits da festa" : "O kit ainda não foi montado"}</h2>
          </div>
          {canEdit && hasItems && !editing ? (
            <Button
              variant="outline"
              onClick={() => {
                playSound("blip");
                setEditing(true);
              }}
              data-testid="kit-plan-edit"
            >
              <Pencil /> Mudar o kit
            </Button>
          ) : null}
        </div>
        {hasItems ? (
          <KitTickets plan={plan} counts={counts.forecast} hasPrices={hasPrices} />
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted" data-testid="kit-plan-empty">
            {canEdit
              ? "Monte logo abaixo, em três fases: o que vem no kit, se os outros kits são iguais e o kit de menor de 18. A conta aparece na hora."
              : "Quem cuida das Configurações monta o kit aqui mesmo. Aí aparece o que vem nele e quanto comprar."}
          </p>
        )}
      </section>

      {/* 2. Montagem (quem edita Configurações). */}
      <AnimatePresence initial={false}>
        {canEdit && editing ? (
          <motion.div key="editor" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <KitEditor
              plan={plan}
              onChange={setPlan}
              dirty={dirty}
              pending={pending}
              onSave={save}
              onClose={hasItems ? () => setEditing(false) : undefined}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 3. A conta: quantos kits, quanto custa e quanto comprar. */}
      {hasItems ? (
        <section className="space-y-4">
          <div>
            <p className="pixel text-[0.55rem] text-red">A conta</p>
            <h2 className="display mt-1 text-[1.6rem] leading-none text-fg">Quanto comprar</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3" data-testid="kit-cost-summary">
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
          </div>
          {!hasPrices ? (
            <p className="text-xs text-fg-muted">Sem preço nos itens: a conta mostra só quantidades. Para ver o custo, ponha o preço de cada item ao mudar o kit.</p>
          ) : forecast.missingPrice ? (
            <p className="text-xs text-warning">Falta o preço de algum item: o total em R$ fica incompleto.</p>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <Panel
              title="Lista de compras"
              icon={List}
              action={
                <label className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
                  <Switch checked={withQueue} onCheckedChange={setWithQueue} disabled={!queue.kits} data-testid="shopping-with-queue" /> Com a fila
                </label>
              }
            >
              <p className="mb-3 text-xs text-fg-muted">
                Para {plural(shopping.kits, "kit", "kits")}
                {withQueue ? " (contando a fila do kit)" : ""}.
              </p>
              <ul className="space-y-1.5" data-testid="shopping-list">
                {shopping.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 odd:bg-white/[0.03]">
                    <span className="min-w-0 truncate font-semibold text-fg">{item.name}</span>
                    <span className="shrink-0 text-right">
                      <span className="display text-2xl text-fg tabular">
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
                            {kind.minors
                              ? ` · ${kind.minors} de menor${kind.minorUnitCents !== null && hasPrices ? ` (${formatCents(kind.minorUnitCents)})` : ""}`
                              : ""}
                          </p>
                        </div>
                        {hasPrices ? <span className="display text-xl text-fg tabular">{formatCents(kind.subtotalCents)}</span> : null}
                      </li>
                    );
                  })}
              </ul>
            </Panel>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Os kits como tíquetes de festa: um para cada kit diferente (e o de menor de 18, se houver). */
function KitTickets({ plan, counts, hasPrices }: { plan: KitPlan; counts: KitCounts; hasPrices: boolean }) {
  const groups = kitGroups(plan);
  const minors = KIT_KINDS.reduce((sum, kind) => sum + counts.minors[kind], 0);
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="kit-tickets">
      {groups.map((group) => {
        const everyone = group.kinds.length === KIT_KINDS.length;
        const kits = group.kinds.reduce((sum, kind) => sum + counts.kits[kind], 0);
        return (
          <Ticket
            key={group.kinds.join("-")}
            title={
              everyone
                ? "Kit de todo mundo"
                : group.kinds.length === 1
                  ? `Kit · ${KIT_KIND_LABEL[group.kinds[0]!]}`
                  : group.kinds.includes("MEMBER")
                    ? "Kit principal"
                    : "Kit"
            }
            audience={everyone ? "Professoras e professores, convidados, colaboradores e cortesias" : group.kinds.map((kind) => KIND_SHORT[kind]).join(" · ")}
            plan={plan}
            lines={group.lines}
            footer={plural(kits, "kit previsto", "kits previstos")}
            hasPrices={hasPrices}
          />
        );
      })}
      {plan.minor ? (
        <Ticket
          title="Menor de 18"
          audience="Quem é menor de 18 recebe este no lugar do outro (a portaria avisa)"
          plan={plan}
          lines={plan.minor.filter((line) => line.quantity > 0)}
          footer={minors ? plural(minors, "menor previsto", "menores previstos") : "Nenhum menor previsto ainda"}
          hasPrices={hasPrices}
          minor
        />
      ) : null}
    </div>
  );
}

function Ticket({
  title,
  audience,
  plan,
  lines,
  footer,
  hasPrices,
  minor = false,
}: {
  title: string;
  audience: string;
  plan: KitPlan;
  lines: KitLine[];
  footer: string;
  hasPrices: boolean;
  minor?: boolean;
}) {
  const cost = kitCost(plan, lines);
  const ordered = plan.items
    .map((item) => ({ item, quantity: lines.find((line) => line.itemId === item.id)?.quantity ?? 0 }))
    .filter((entry) => entry.quantity > 0);
  return (
    <motion.article
      initial={{ opacity: 0, y: 10, rotate: -0.6 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 shadow-[0_16px_36px_-22px_var(--glow)]",
        minor ? "border-[#22d3ee]/55 bg-[linear-gradient(160deg,#04262b,#0e0e0f_62%)]" : "border-red/55 bg-[linear-gradient(160deg,#2a0507,#0e0e0f_62%)]",
      )}
      data-testid="kit-ticket"
    >
      <span className="scanlines pointer-events-none absolute inset-0 opacity-25" aria-hidden />
      <div className="relative flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className={cn("pixel text-[0.5rem]", minor ? "text-[#67e8f9]" : "text-warning")}>{minor ? "Kit especial" : "Kit de consumação"}</p>
          <p className="display mt-1 text-[1.55rem] leading-none text-fg">{title}</p>
          <p className="mt-1 text-xs leading-snug text-fg-muted">{audience}</p>
        </div>
        <span
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-white",
            minor ? "bg-[#0891b2] shadow-[0_3px_0_0_#155e75]" : "bg-red shadow-[0_3px_0_0_var(--brand-strong)]",
          )}
        >
          {minor ? <Hourglass className="size-6" /> : <Gift className="size-6" />}
        </span>
      </div>
      {/* Picote do tíquete. */}
      <div className="relative my-3 border-t-2 border-dashed border-white/15" aria-hidden>
        <span className="absolute -top-2.5 -left-2.5 size-5 rounded-full bg-ink" />
        <span className="absolute -top-2.5 -right-2.5 size-5 rounded-full bg-ink" />
      </div>
      <ul className="relative grid gap-1 px-4">
        {ordered.length ? (
          ordered.map(({ item, quantity }) => (
            <li key={item.id} className="flex items-baseline gap-2.5">
              <span className={cn("display w-10 shrink-0 text-right text-2xl leading-none tabular", minor ? "text-[#67e8f9]" : "text-warning")}>
                {quantity}×
              </span>
              <span className="min-w-0 truncate font-semibold text-fg">{item.name || "Item sem nome"}</span>
            </li>
          ))
        ) : (
          <li className="text-sm text-fg-muted">Nada (kit vazio)</li>
        )}
      </ul>
      <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-white/10 bg-black/30 px-4 py-2.5 text-xs text-fg-muted">
        <span className="tabular">{footer}</span>
        <span className={cn("tabular", hasPrices && "font-bold text-fg")}>{hasPrices ? `${formatCents(cost.cents)} por kit` : "sem preço"}</span>
      </div>
    </motion.article>
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

function describe(plan: KitPlan, lines: KitLine[]) {
  const parts = lines
    .filter((line) => line.quantity > 0)
    .map((line) => `${line.quantity} ${plan.items.find((item) => item.id === line.itemId)?.name ?? "?"}`);
  return parts.length ? parts.join(" · ") : "nada";
}

const quantityOf = (lines: KitLine[], itemId: string) => lines.find((line) => line.itemId === itemId)?.quantity ?? 0;
const withQuantity = (lines: KitLine[], itemId: string, quantity: number) => {
  const others = lines.filter((line) => line.itemId !== itemId);
  return quantity > 0 ? [...others, { itemId, quantity }] : others;
};

/** Uma fase da montagem (numerada como as fases do jogo). */
function Phase({
  n,
  title,
  hint,
  extra,
  children,
  testId,
}: {
  n: number;
  title: string;
  hint: string;
  extra?: string | null;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-xl border border-line-strong bg-surface-2/70 p-3.5 sm:p-4" data-testid={testId}>
      <div className="flex items-start gap-3">
        <span className="pixel inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-red text-[0.6rem] text-white shadow-[0_3px_0_0_var(--brand-strong)]">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="display text-xl leading-none text-fg">{title}</h3>
            {extra ? <span className="pixel text-[0.5rem] text-fg-muted">{extra}</span> : null}
          </div>
          <p className="mt-1 text-sm leading-snug text-fg-muted">{hint}</p>
        </div>
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** Montar o kit, em três fases. */
function KitEditor({
  plan,
  onChange,
  dirty,
  pending,
  onSave,
  onClose,
}: {
  plan: KitPlan;
  onChange: (plan: KitPlan) => void;
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  /** Fecha a montagem (só quando o kit já existe). */
  onClose?: () => void;
}) {
  const [priceText, setPriceText] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.items.map((item) => [item.id, item.priceCents === null ? "" : (item.priceCents / 100).toFixed(2).replace(".", ",")])),
  );
  const [badPrice, setBadPrice] = useState<Record<string, boolean>>({});
  const hasPrices = plan.items.some((item) => item.priceCents !== null);
  const memberCost = kitCost(plan, linesFor(plan, "MEMBER"));
  const alcohol = alcoholItems(plan);

  function addItem(name = "") {
    if (plan.items.length >= MAX_KIT_ITEMS) return;
    if (name && plan.items.some((item) => item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return;
    playSound("blip");
    const id = uuidv4();
    // Item novo já entra no kit (1 unidade): é só ajustar a quantidade.
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

  return (
    <section className="rounded-2xl border-2 border-red/45 bg-surface p-3.5 shadow-[0_0_40px_-28px_var(--glow)] sm:p-5" data-testid="kit-editor">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="pixel text-[0.55rem] text-red">
            Montagem<span className="animate-blink">_</span>
          </p>
          <h2 className="display mt-1 text-[1.6rem] leading-none text-fg">Montar o kit</h2>
          <p className="mt-1 text-sm text-fg-muted">Três fases. Os tíquetes e a conta mudam na hora; nada vale antes de salvar.</p>
        </div>
        {onClose && !dirty ? (
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="kit-plan-close">
            <Close /> Fechar
          </Button>
        ) : null}
      </header>

      <div className="space-y-3">
        <Phase
          n={1}
          title="O que vem no kit"
          hint="Este é o kit da professora e do professor. Os outros kits usam o mesmo, a não ser que você mude na fase 2. O preço é opcional (serve para a conta)."
          extra={hasPrices ? `${formatCents(memberCost.cents)} por kit` : null}
          testId="kit-kind-member"
        >
          <ul className="grid gap-2">
            <AnimatePresence initial={false}>
              {plan.items.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="rounded-xl border border-line bg-ink/50 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      id={`kit-item-${item.id}`}
                      value={item.name}
                      placeholder="Ex.: Cerveja"
                      maxLength={40}
                      onChange={(event) => setItem(item.id, { name: event.target.value })}
                      aria-label="Nome do item"
                      className="min-w-0 flex-1 font-semibold"
                      data-testid="kit-item-name"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(item.id)} aria-label={`Tirar ${item.name || "item"} dos kits`}>
                      <Trash />
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-[0.06em] text-fg-muted uppercase">No kit</span>
                      <Stepper
                        value={quantityOf(plan.kits.MEMBER, item.id)}
                        onChange={(next) => onChange({ ...plan, kits: { ...plan.kits, MEMBER: withQuantity(plan.kits.MEMBER, item.id, next) } })}
                        label={`${item.name || "item"} no kit`}
                      />
                    </span>
                    <label className="flex items-center gap-2 text-xs font-bold tracking-[0.06em] text-fg-muted uppercase">
                      Preço
                      <Input
                        value={priceText[item.id] ?? ""}
                        placeholder="opcional"
                        inputMode="decimal"
                        onChange={(event) => setPrice(item.id, event.target.value)}
                        aria-label={`Preço de uma unidade de ${item.name || "item"}`}
                        aria-invalid={badPrice[item.id] ?? false}
                        className={cn("h-10 w-28 text-right font-sans tracking-normal normal-case tabular", badPrice[item.id] && "border-danger")}
                        data-testid="kit-item-price"
                      />
                    </label>
                  </div>
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
        </Phase>

        {plan.items.length ? (
          <>
            <Phase n={2} title="Os outros kits são iguais?" hint="Quase sempre, sim. Toque em Diferente só no kit que muda.">
              <div className="grid gap-2">
                {KIT_KINDS.filter((kind) => kind !== "MEMBER").map((kind) => (
                  <KindChoice key={kind} kind={kind} plan={plan} lines={plan.kits[kind]} onLines={(lines) => onChange({ ...plan, kits: { ...plan.kits, [kind]: lines } })} />
                ))}
              </div>
            </Phase>

            <Phase n={3} title="Menor de 18" hint="Quem é menor de 18 pode receber outro kit. Com ele montado, a portaria avisa qual entregar.">
              {alcohol.length && !plan.minor ? (
                <p className="mb-3 flex items-start gap-2 rounded-lg border border-warning/50 bg-warning-soft px-3 py-2.5 text-sm text-fg" data-testid="kit-minor-tip">
                  <Warning className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    O kit tem <strong>{alcohol.join(", ")}</strong>. Para menores de 18, monte um kit sem bebida alcoólica: toque em Kit diferente.
                  </span>
                </p>
              ) : null}
              <KindChoice kind="MINOR" plan={plan} lines={plan.minor} onLines={(lines) => onChange({ ...plan, minor: lines })} />
            </Phase>
          </>
        ) : null}
      </div>

      <div className="sticky bottom-3 z-10 mt-4 flex items-center justify-between gap-3 rounded-xl border border-line-strong bg-ink/95 p-3 backdrop-blur">
        <p className="text-xs text-fg-muted">{dirty ? "Alterações não salvas: os tíquetes e a conta já mostram como fica." : "Tudo salvo."}</p>
        <Button onClick={onSave} disabled={!dirty || pending} data-testid="kit-plan-save">
          {pending ? <Loader className="animate-spin-steps" /> : <Save />} Salvar o kit
        </Button>
      </div>
    </section>
  );
}

/** Um tipo de kit (ou o de menor de 18): igual ao da professora e do professor, ou diferente (com as quantidades). */
function KindChoice({
  kind,
  plan,
  lines,
  onLines,
}: {
  kind: KitKind | "MINOR";
  plan: KitPlan;
  /** null = igual ao kit da professora e do professor. */
  lines: KitLine[] | null;
  onLines: (lines: KitLine[] | null) => void;
}) {
  const custom = lines !== null;
  const shown = lines ?? plan.kits.MEMBER;
  const minor = kind === "MINOR";
  const Icon = minor ? Hourglass : KIND_ICON[kind];
  const title = minor ? "Kit de menor de 18" : KIT_KIND_LABEL[kind];
  const key = kind.toLowerCase();

  function choose(same: boolean) {
    if (same === !custom) return;
    playSound("blip");
    // Ao separar, começa com o kit da professora e do professor para só ajustar.
    onLines(same ? null : plan.kits.MEMBER.map((line) => ({ ...line })));
  }

  return (
    <div className={cn("rounded-xl border p-3", custom ? "border-warning/50 bg-ink/60" : "border-line bg-ink/30")} data-testid={`kit-kind-${key}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", custom ? "bg-warning text-ink" : "bg-surface-3 text-fg-muted")}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <p className="font-bold leading-tight text-fg">{title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">
            {custom ? describe(plan, shown) : minor ? "Recebe o mesmo kit dos adultos" : "Igual ao da professora e do professor"}
          </p>
        </div>
        <div className="flex w-full shrink-0 rounded-lg border border-line-strong bg-ink p-0.5 sm:w-auto" role="group" aria-label={`${title}: igual ou diferente`}>
          {[
            { same: true, label: minor ? "Mesmo kit" : "Igual", testId: `kit-same-${key}` },
            { same: false, label: minor ? "Kit diferente" : "Diferente", testId: `kit-diff-${key}` },
          ].map((option) => {
            const active = option.same === !custom;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => choose(option.same)}
                aria-pressed={active}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-xs font-bold transition-colors sm:flex-none sm:py-1.5",
                  active ? (option.same ? "bg-surface-3 text-fg" : "bg-warning text-ink") : "text-fg-dim hover:text-fg",
                )}
                data-testid={option.testId}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      {custom ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {plan.items.map((item) => {
            const quantity = quantityOf(shown, item.id);
            return (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
                <span className={cn("min-w-0 truncate text-sm font-semibold", quantity ? "text-fg" : "text-fg-dim")}>{item.name || "Item sem nome"}</span>
                <Stepper value={quantity} onChange={(next) => onLines(withQuantity(shown, item.id, next))} label={`${item.name || "item"} no ${title}`} />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
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
        className="inline-flex size-9 items-center justify-center rounded-md border border-line-strong text-fg transition-transform active:scale-90 disabled:opacity-30"
        aria-label={`Menos ${label}`}
      >
        <Minus className="size-4" />
      </button>
      <span className="display w-8 text-center text-xl text-fg tabular" data-testid="kit-quantity">
        {value}
      </span>
      <button
        type="button"
        onClick={() => set(value + 1)}
        className="inline-flex size-9 items-center justify-center rounded-md border border-red/60 bg-brand-soft text-fg transition-transform active:scale-90"
        aria-label={`Mais ${label}`}
      >
        <Plus className="size-4" />
      </button>
    </span>
  );
}
