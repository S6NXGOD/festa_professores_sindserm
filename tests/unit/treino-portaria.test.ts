import { describe, expect, it } from "vitest";
import { shuffled, type TrainingContext, trainingScenarios } from "@/components/gate/training/scenarios";

const base: TrainingContext = {
  abilities: { resolve: false, forms: false, register: false, courtesy: false },
  kitDeadline: { label: "22:30", at: "2026-10-17T01:30:00.000Z" },
  startClock: "19h",
  startsAt: "2026-10-16T22:00:00.000Z",
  minorKit: false,
};

const rightAnswer = (ctx: TrainingContext, id: string) => {
  const scenario = trainingScenarios(ctx).find((s) => s.id === id)!;
  return scenario.options.find((option) => option.correct)!;
};

describe("treino da portaria", () => {
  it("cada situação tem uma só resposta certa, e toda resposta explica o porquê", () => {
    for (const scenario of trainingScenarios(base)) {
      expect(scenario.options.filter((option) => option.correct), scenario.id).toHaveLength(1);
      expect(scenario.options.length, scenario.id).toBe(3);
      for (const option of scenario.options) expect(option.why.length, `${scenario.id}: ${option.label}`).toBeGreaterThan(10);
      expect(scenario.lesson.length, scenario.id).toBeGreaterThan(5);
    }
  });

  it("a resposta certa segue o que a pessoa pode fazer no sistema", () => {
    expect(rightAnswer(base, "conferencia").label).toContain("Atendimento");
    expect(rightAnswer({ ...base, abilities: { ...base.abilities, resolve: true } }, "conferencia").label).toContain("Confirmar filiação");
    expect(rightAnswer(base, "ficha").label).toContain("Atendimento");
    expect(rightAnswer({ ...base, abilities: { ...base.abilities, forms: true } }, "ficha").label).toContain("Confirmar assinatura");
    expect(rightAnswer(base, "sem-inscricao").label).toContain("Atendimento");
    expect(rightAnswer({ ...base, abilities: { ...base.abilities, register: true } }, "sem-inscricao").label).toContain("Cadastrar agora");
    expect(rightAnswer(base, "fora-da-lista").label).toContain("Chamo quem pode cadastrar cortesia");
    expect(rightAnswer({ ...base, abilities: { ...base.abilities, courtesy: true } }, "fora-da-lista").label).toContain("Entrar como cortesia");
    // A busca vazia mostra só os botões que a pessoa vê de verdade.
    const search = trainingScenarios({ ...base, abilities: { ...base.abilities, register: true } }).find((s) => s.id === "sem-inscricao")!.screen;
    expect(search).toMatchObject({ kind: "search", register: true, courtesy: false });
  });

  it("o horário dos kits guardados entra no treino (e as sobras só existem com horário)", () => {
    const withDeadline = trainingScenarios(base);
    expect(withDeadline.map((s) => s.id)).toContain("sobras");
    expect(rightAnswer(base, "fila-do-kit").label).toContain("22:30");
    const without = trainingScenarios({ ...base, kitDeadline: null });
    expect(without.map((s) => s.id)).not.toContain("sobras");
    expect(rightAnswer({ ...base, kitDeadline: null }, "fila-do-kit").why).toContain("Entregar kit de sobra");
  });

  it("antes do horário, a regra é esperar (registrar antes só com a organização liberando)", () => {
    const early = rightAnswer(base, "antes-da-hora");
    expect(early.label).toContain("Esperar o horário");
    expect(early.why).toContain("Registrar mesmo assim");
  });

  it("menor de 18: com kit de menor na montagem, o cartão e a resposta dizem para entregar esse", () => {
    const minor = trainingScenarios({ ...base, minorKit: true }).find((s) => s.id === "menor")!;
    expect(minor.screen.kind === "card" && minor.screen.view.minorKit).toBe(true);
    expect(minor.screen.kind === "card" && minor.screen.view.kitOnEntry).toMatchObject({ kind: "WILL_DELIVER", minors: 1 });
    expect(minor.options.find((option) => option.correct)!.label).toContain("kit de menor");
    expect(rightAnswer(base, "menor").label).toContain("fico de olho");
  });

  it("as respostas trocam de lugar sem sorteio (igual no servidor e no navegador)", () => {
    const items = ["a", "b", "c"];
    expect(shuffled(items, 5)).toEqual(shuffled(items, 5));
    expect([...shuffled(items, 3)].sort()).toEqual(items);
    // Com a semente da tela (situação × rodada), a certa não fica sempre no mesmo lugar.
    const positions = trainingScenarios(base).map((scenario, index) => shuffled(scenario.options, (index + 1) * 3).findIndex((o) => o.correct));
    expect(new Set(positions).size).toBe(3);
  });
});
