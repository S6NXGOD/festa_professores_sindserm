import { z } from "zod";
import { toSearchText } from "@/lib/text";

/*
 * Montagem dos kits: o que vem em cada tipo de kit (itens e quantidades, com
 * preço opcional) e a conta de quanto a consumação custa — com os inscritos de
 * agora, com a fila do kit e com o que já saiu. Os tipos seguem quem tem
 * direito a kit; por padrão, todos iguais ao kit da professora e do professor.
 */

export const KIT_KINDS = ["MEMBER", "GUEST", "EMPLOYEE", "EMPLOYEE_GUEST", "COURTESY"] as const;
export type KitKind = (typeof KIT_KINDS)[number];

export const KIT_KIND_LABEL: Record<KitKind, string> = {
  MEMBER: "Professora e professor",
  GUEST: "Convidado(a) de professor(a)",
  EMPLOYEE: "Colaborador(a) do SINDSERM",
  EMPLOYEE_GUEST: "Convidado(a) de colaborador(a)",
  COURTESY: "Cortesia",
};

/** Limites do formulário (uma festa, um punhado de itens). */
export const MAX_KIT_ITEMS = 30;
export const MAX_ITEM_QUANTITY = 99;

const itemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1, "Dê um nome ao item").max(40, "Nome muito longo (até 40 letras)"),
  /** Preço de uma unidade, em centavos (vazio = sem preço). */
  priceCents: z.number().int().min(0).max(1_000_000, "Preço muito alto").nullable(),
});

const lineSchema = z.object({
  itemId: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(0).max(MAX_ITEM_QUANTITY),
});

const linesSchema = z.array(lineSchema).max(MAX_KIT_ITEMS);

export const kitPlanSchema = z
  .object({
    items: z.array(itemSchema).max(MAX_KIT_ITEMS, `Até ${MAX_KIT_ITEMS} itens`),
    kits: z.object({
      MEMBER: linesSchema,
      // null = igual ao kit da professora e do professor.
      GUEST: linesSchema.nullable(),
      EMPLOYEE: linesSchema.nullable(),
      EMPLOYEE_GUEST: linesSchema.nullable(),
      COURTESY: linesSchema.nullable(),
    }),
    /** Menor de 18 recebe outro kit (ex.: sem bebida alcoólica). null = o mesmo kit. */
    minor: linesSchema.nullable(),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    plan.items.forEach((item, index) => {
      const key = item.name.toLocaleLowerCase("pt-BR");
      if (names.has(key)) ctx.addIssue({ code: "custom", path: ["items", index, "name"], message: "Item repetido" });
      names.add(key);
      ids.add(item.id);
    });
    const check = (lines: { itemId: string }[] | null, path: (string | number)[]) =>
      lines?.forEach((line, index) => {
        if (!ids.has(line.itemId)) ctx.addIssue({ code: "custom", path: [...path, index, "itemId"], message: "Item que não existe mais" });
      });
    for (const kind of KIT_KINDS) check(plan.kits[kind], ["kits", kind]);
    check(plan.minor, ["minor"]);
  });

export type KitPlan = z.output<typeof kitPlanSchema>;
export type KitPlanInput = z.input<typeof kitPlanSchema>;
export type KitLine = KitPlan["kits"]["MEMBER"][number];

/** Plano vazio para começar a montar. */
export function emptyKitPlan(): KitPlan {
  return { items: [], kits: { MEMBER: [], GUEST: null, EMPLOYEE: null, EMPLOYEE_GUEST: null, COURTESY: null }, minor: null };
}

/** O que vem num tipo de kit (os tipos "iguais" usam o kit da professora e do professor). */
export function linesFor(plan: KitPlan, kind: KitKind): KitLine[] {
  return (plan.kits[kind] ?? plan.kits.MEMBER).filter((line) => line.quantity > 0);
}

/** Quanto custa um kit (só os itens com preço) e se faltou preço em algum item dele. */
export function kitCost(plan: KitPlan, lines: KitLine[]): { cents: number; missingPrice: boolean } {
  let cents = 0;
  let missingPrice = false;
  for (const line of lines) {
    const item = plan.items.find((candidate) => candidate.id === line.itemId);
    if (!item) continue;
    if (item.priceCents === null) missingPrice = true;
    else cents += item.priceCents * line.quantity;
  }
  return { cents, missingPrice };
}

/** Quantos kits de cada tipo (e, deles, quantos para menores de 18). */
export interface KitCounts {
  kits: Record<KitKind, number>;
  minors: Record<KitKind, number>;
}

export interface KitKindTotal {
  kind: KitKind;
  kits: number;
  minors: number;
  /** Custo de um kit (e do kit de menor, quando é diferente). */
  unitCents: number;
  minorUnitCents: number | null;
  subtotalCents: number;
}

export interface KitPlanTotals {
  kinds: KitKindTotal[];
  /** Lista de compras: quanto de cada item. */
  items: { id: string; name: string; quantity: number; priceCents: number | null; costCents: number }[];
  kits: number;
  totalCents: number;
  /** Algum item usado está sem preço (o total em R$ fica incompleto). */
  missingPrice: boolean;
}

/** A conta da consumação para uma quantidade de kits por tipo. */
export function kitPlanTotals(plan: KitPlan, counts: KitCounts): KitPlanTotals {
  const quantities = new Map<string, number>();
  const add = (lines: KitLine[], kits: number) => {
    for (const line of lines) quantities.set(line.itemId, (quantities.get(line.itemId) ?? 0) + line.quantity * kits);
  };
  let missingPrice = false;
  const kinds = KIT_KINDS.map((kind): KitKindTotal => {
    const lines = linesFor(plan, kind);
    const minorLines = plan.minor ? plan.minor.filter((line) => line.quantity > 0) : null;
    const kits = counts.kits[kind];
    // Menores só contam à parte quando o kit de menor é diferente.
    const minors = minorLines ? Math.min(kits, counts.minors[kind]) : 0;
    const unit = kitCost(plan, lines);
    const minorUnit = minorLines ? kitCost(plan, minorLines) : null;
    if (kits - minors > 0 && unit.missingPrice) missingPrice = true;
    if (minors > 0 && minorUnit?.missingPrice) missingPrice = true;
    add(lines, kits - minors);
    if (minorLines) add(minorLines, minors);
    return {
      kind,
      kits,
      minors,
      unitCents: unit.cents,
      minorUnitCents: minorUnit ? minorUnit.cents : null,
      subtotalCents: unit.cents * (kits - minors) + (minorUnit ? minorUnit.cents * minors : 0),
    };
  });
  const items = plan.items
    .map((item) => {
      const quantity = quantities.get(item.id) ?? 0;
      return { id: item.id, name: item.name, quantity, priceCents: item.priceCents, costCents: (item.priceCents ?? 0) * quantity };
    })
    .filter((item) => item.quantity > 0);
  return {
    kinds,
    items,
    kits: kinds.reduce((sum, kind) => sum + kind.kits, 0),
    totalCents: kinds.reduce((sum, kind) => sum + kind.subtotalCents, 0),
    missingPrice,
  };
}

/** Palavras de bebida alcoólica (sem acento, minúsculas): o kit de menor de 18 deve ficar sem elas. */
const ALCOHOL_WORDS = new Set([
  "cerveja",
  "chop",
  "chope",
  "chopp",
  "vinho",
  "vodka",
  "whisky",
  "uisque",
  "cachaca",
  "caipirinha",
  "caipiroska",
  "caipifruta",
  "drink",
  "gin",
  "rum",
  "tequila",
  "licor",
  "espumante",
  "batida",
]);

/** O nome tem bebida alcoólica? Palavra por palavra ("Arrumadinho" não é rum). */
function isAlcohol(name: string): boolean {
  return toSearchText(name)
    .split(/[^a-z]+/)
    .some((word) => ALCOHOL_WORDS.has(word) || ALCOHOL_WORDS.has(word.replace(/e?s$/, "")));
}

/** Itens com bebida alcoólica usados em algum kit (para sugerir o kit de menor de 18). */
export function alcoholItems(plan: KitPlan): string[] {
  const used = new Set(KIT_KINDS.flatMap((kind) => linesFor(plan, kind).map((line) => line.itemId)));
  return plan.items.filter((item) => used.has(item.id) && isAlcohol(item.name)).map((item) => item.name);
}

/** Tipos de kit com o mesmo conteúdo, juntos: um tíquete para cada kit diferente. */
export function kitGroups(plan: KitPlan): { kinds: KitKind[]; lines: KitLine[] }[] {
  const groups: { key: string; kinds: KitKind[]; lines: KitLine[] }[] = [];
  for (const kind of KIT_KINDS) {
    const lines = linesFor(plan, kind);
    const key = lines
      .map((line) => `${line.itemId}:${line.quantity}`)
      .sort()
      .join("|");
    const group = groups.find((candidate) => candidate.key === key);
    if (group) group.kinds.push(kind);
    else groups.push({ key, kinds: [kind], lines });
  }
  return groups.map(({ kinds, lines }) => ({ kinds, lines }));
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 1.234,50". */
export function formatCents(cents: number): string {
  return money.format(cents / 100);
}

/** "4,50", "4.5", "R$ 4" → 450 centavos; vazio → null; inválido → NaN. */
export function parsePrice(raw: string): number | null {
  const text = raw.replace(/r\$/i, "").replace(/\s/g, "");
  if (!text) return null;
  // "1.234,56" (milhar com ponto) ou "4,50" / "4.50".
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

/** Lista de compras em texto (para copiar ou mandar no WhatsApp). */
export function shoppingListText(totals: KitPlanTotals, title: string): string {
  const lines = totals.items.map((item) => `• ${item.name}: ${item.quantity.toLocaleString("pt-BR")}`);
  const total = totals.totalCents > 0 ? `\nTotal: ${formatCents(totals.totalCents)}${totals.missingPrice ? " (falta preço de algum item)" : ""}` : "";
  return `${title}\n${totals.kits.toLocaleString("pt-BR")} kits\n\n${lines.join("\n")}${total}`;
}
