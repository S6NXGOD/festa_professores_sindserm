/**
 * Montagem e custo dos kits: a conta da consumação (pura, sem banco) e o que o
 * formulário de inscrição mostra quando os kits acabaram.
 */
import { describe, expect, it } from "vitest";
import { kitOutlook, kitsSoldOut } from "@/domain/kit-supply";
import { formatCents, type KitCounts, type KitPlan, kitPlanSchema, kitPlanTotals, parsePrice, shoppingListText } from "@/domain/kit-plan";

const counts = (kits: Partial<KitCounts["kits"]>, minors: Partial<KitCounts["minors"]> = {}): KitCounts => ({
  kits: { MEMBER: 0, GUEST: 0, EMPLOYEE: 0, EMPLOYEE_GUEST: 0, COURTESY: 0, ...kits },
  minors: { MEMBER: 0, GUEST: 0, EMPLOYEE: 0, EMPLOYEE_GUEST: 0, COURTESY: 0, ...minors },
});

/** Cerveja R$ 5, refrigerante R$ 4, espetinho R$ 6. Professor(a): 2 cervejas + 1 espetinho; convidado igual; colaborador: só 1 cerveja. */
const plan: KitPlan = {
  items: [
    { id: "cerveja", name: "Cerveja", priceCents: 500 },
    { id: "refri", name: "Refrigerante", priceCents: 400 },
    { id: "espeto", name: "Espetinho", priceCents: 600 },
  ],
  kits: {
    MEMBER: [
      { itemId: "cerveja", quantity: 2 },
      { itemId: "espeto", quantity: 1 },
    ],
    GUEST: null,
    EMPLOYEE: [{ itemId: "cerveja", quantity: 1 }],
    EMPLOYEE_GUEST: null,
    COURTESY: null,
  },
  // Menor de 18: refrigerante no lugar da cerveja.
  minor: [
    { itemId: "refri", quantity: 2 },
    { itemId: "espeto", quantity: 1 },
  ],
};

describe("preço digitado", () => {
  it("aceita vírgula, ponto, milhar e R$; vazio é sem preço; texto estranho é inválido", () => {
    expect(parsePrice("4,50")).toBe(450);
    expect(parsePrice("4.5")).toBe(450);
    expect(parsePrice("R$ 1.234,56")).toBe(123456);
    expect(parsePrice("12")).toBe(1200);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("quatro")).toBeNaN();
    expect(parsePrice("4,555")).toBeNaN();
  });
});

describe("conta da consumação", () => {
  it("kits iguais herdam o do(a) professor(a); kit de menor conta à parte; a lista de compras soma tudo", () => {
    const totals = kitPlanTotals(plan, counts({ MEMBER: 10, GUEST: 4, EMPLOYEE: 3, COURTESY: 2 }, { GUEST: 1, COURTESY: 1 }));
    // Professor(a): 2×5 + 6 = R$ 16. Menor: 2×4 + 6 = R$ 14. Colaborador(a): R$ 5.
    expect(totals.kinds.find((k) => k.kind === "MEMBER")).toMatchObject({ kits: 10, unitCents: 1600, subtotalCents: 16000 });
    expect(totals.kinds.find((k) => k.kind === "GUEST")).toMatchObject({ kits: 4, minors: 1, unitCents: 1600, minorUnitCents: 1400, subtotalCents: 3 * 1600 + 1400 });
    expect(totals.kinds.find((k) => k.kind === "EMPLOYEE")).toMatchObject({ kits: 3, unitCents: 500, subtotalCents: 1500 });
    expect(totals.kinds.find((k) => k.kind === "COURTESY")).toMatchObject({ kits: 2, minors: 1, subtotalCents: 1600 + 1400 });
    expect(totals.kits).toBe(19);
    expect(totals.totalCents).toBe(16000 + 6200 + 1500 + 3000);
    // Cervejas: 10×2 + 3×2 (convidados adultos) + 3×1 (colaboradores) + 1×2 (cortesia adulta) = 31.
    expect(totals.items).toEqual([
      { id: "cerveja", name: "Cerveja", quantity: 31, priceCents: 500, costCents: 15500 },
      { id: "refri", name: "Refrigerante", quantity: 4, priceCents: 400, costCents: 1600 },
      { id: "espeto", name: "Espetinho", quantity: 16, priceCents: 600, costCents: 9600 },
    ]);
    expect(totals.missingPrice).toBe(false);
    expect(shoppingListText(totals, "Lista")).toBe(`Lista\n19 kits\n\n• Cerveja: 31\n• Refrigerante: 4\n• Espetinho: 16\nTotal: ${formatCents(26700)}`);
    expect(formatCents(26700)).toMatch(/^R\$\s267,00$/);
  });

  it("item sem preço: a quantidade entra na lista e o total avisa que está incompleto", () => {
    const noPrice: KitPlan = { ...plan, items: plan.items.map((item) => (item.id === "espeto" ? { ...item, priceCents: null } : item)) };
    const totals = kitPlanTotals(noPrice, counts({ MEMBER: 1 }));
    expect(totals).toMatchObject({ totalCents: 1000, missingPrice: true });
    expect(totals.items.find((item) => item.id === "espeto")).toMatchObject({ quantity: 1, costCents: 0 });
  });

  it("sem kit de menor diferente, menores recebem o kit normal", () => {
    const totals = kitPlanTotals({ ...plan, minor: null }, counts({ GUEST: 2 }, { GUEST: 2 }));
    expect(totals.kinds.find((k) => k.kind === "GUEST")).toMatchObject({ minors: 0, subtotalCents: 3200 });
  });

  it("validação: nome repetido e item que não existe são recusados", () => {
    const repeated = kitPlanSchema.safeParse({ ...plan, items: [...plan.items, { id: "x", name: "cerveja", priceCents: 100 }] });
    expect(repeated.success).toBe(false);
    const ghost = kitPlanSchema.safeParse({ ...plan, kits: { ...plan.kits, MEMBER: [{ itemId: "sumiu", quantity: 1 }] } });
    expect(ghost.success).toBe(false);
    expect(kitPlanSchema.safeParse(plan).success).toBe(true);
  });
});

describe("aviso do formulário quando os kits acabam", () => {
  it("estoque único: o último kit fica com o(a) professor(a) e o convidado vai para a fila", () => {
    const supply = { shared: true, member: 1, guest: 1, queue: { member: 4, guest: 4 } };
    expect(kitsSoldOut(supply)).toBe(false);
    expect(kitOutlook(supply, { teacher: true, guest: true })).toEqual({ member: "KIT", guest: "WAITLIST", position: { member: null, guest: 5 } });
    expect(kitOutlook(supply, { teacher: false, guest: false })).toEqual({ member: null, guest: null, position: { member: null, guest: null } });
  });

  it("esgotado: os dois vão para a fila, um atrás do outro; sem estoque cadastrado, nunca há fila", () => {
    const soldOut = { shared: true, member: 0, guest: 0, queue: { member: 2, guest: 2 } };
    expect(kitsSoldOut(soldOut)).toBe(true);
    expect(kitOutlook(soldOut, { teacher: true, guest: true }).position).toEqual({ member: 3, guest: 4 });
    expect(kitOutlook({ shared: true, member: null, guest: null, queue: { member: 0, guest: 0 } }, { teacher: true, guest: true })).toMatchObject({
      member: "KIT",
      guest: "KIT",
    });
    // Estoque separado: cada fila conta sozinha.
    expect(kitOutlook({ shared: false, member: 0, guest: 3, queue: { member: 1, guest: 0 } }, { teacher: true, guest: true })).toEqual({
      member: "WAITLIST",
      guest: "KIT",
      position: { member: 2, guest: null },
    });
  });
});
