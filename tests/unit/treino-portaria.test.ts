import { describe, expect, it } from "vitest";
import { quickQuestions, shuffled, type TrainingContext } from "@/components/gate/training/scenarios";
import { ACCESS_MODULES, type AccessMap, ROLE_PRESETS } from "@/domain/access";
import { gateTrainingRequired } from "@/domain/tutorial";

const base: TrainingContext = { resolve: false, kitDeadline: "22:30", minorKit: false };
const byId = (ctx: TrainingContext, id: string) => quickQuestions(ctx).find((question) => question.id === id)!;

describe("treino relâmpago da portaria", () => {
  it("é curto: 8 situações, cada uma com a resposta certa, a errada e a regra numa frase", () => {
    const questions = quickQuestions(base);
    expect(questions).toHaveLength(8);
    expect(new Set(questions.map((question) => question.id)).size).toBe(8);
    for (const question of questions) {
      expect(question.right, question.id).not.toBe(question.wrong);
      // Respostas curtas (cabem num botão do celular) e a regra numa frase só.
      expect(question.right.length, question.id).toBeLessThanOrEqual(55);
      expect(question.wrong.length, question.id).toBeLessThanOrEqual(55);
      expect(question.lesson.length, question.id).toBeLessThanOrEqual(110);
    }
  });

  it("as cores são as da portaria: verde libera, amarelo falta resolver, vermelho parou", () => {
    expect(byId(base, "verde").card).toMatchObject({ tone: "success", title: "LIBERADO PARA ENTRADA" });
    expect(byId(base, "amarelo").card).toMatchObject({ tone: "warning", title: "FILIAÇÃO AGUARDANDO CONFERÊNCIA" });
    expect(byId(base, "vermelho").card).toMatchObject({ tone: "danger", title: "FILIAÇÃO NÃO CONFIRMADA" });
  });

  it("a resposta certa segue o acesso: quem não confere filiação manda ao Atendimento", () => {
    expect(byId(base, "amarelo").right).toBe("Mandar ao Atendimento");
    expect(byId({ ...base, resolve: true }, "amarelo").right).toBe("Conferir e confirmar a filiação");
  });

  it("o horário dos kits guardados entra na regra da fila; o kit de menor só aparece se existir", () => {
    expect(byId(base, "fila-do-kit").lesson).toContain("Depois das 22:30");
    expect(byId({ ...base, kitDeadline: null }, "fila-do-kit").lesson).toContain("só sai se sobrar");
    expect(quickQuestions(base).map((question) => question.id)).not.toContain("menor");
    expect(byId({ ...base, minorKit: true }, "menor").card.kit?.detail).toBe("Kit de menor de 18");
  });

  it("kit dividido: o convidado entra sem kit próprio e quem convidou leva 1 kit, para os dois", () => {
    const shared = { ...base, sharedKit: true };
    const questions = quickQuestions(shared);
    expect(questions).toHaveLength(8);
    expect(questions.map((question) => question.id)).not.toContain("dois-kits");
    for (const question of questions) {
      expect(question.right.length, question.id).toBeLessThanOrEqual(55);
      expect(question.wrong.length, question.id).toBeLessThanOrEqual(55);
      expect(question.lesson.length, question.id).toBeLessThanOrEqual(110);
    }
    expect(byId(shared, "convidado-antes").card.kit).toEqual({ kind: "none", title: "Sem kit próprio", detail: "O kit da Carla é para as duas" });
    expect(byId(shared, "kit-para-dois")).toMatchObject({
      card: { kit: { kind: "give", title: "Entregue 1 kit" } },
      right: "Confirmar e entregar 1 kit, para os dois",
      wrong: "Entregar 2 kits, um para cada",
    });
    // Menor de 18 com kit próprio: uma cortesia (convidado nenhum tem kit).
    expect(byId({ ...shared, minorKit: true }, "menor").card.role).toContain("Cortesia");
    // Na mesa dos kits, o convidado não vai à mesa.
    const atDesk = quickQuestions({ ...shared, kitsAtDesk: true });
    expect(atDesk.map((question) => question.id)).not.toContain("kit-para-dois");
    expect(atDesk.find((question) => question.id === "convidado-antes")?.card.kit?.kind).toBe("none");
  });

  it("a resposta certa troca de lugar sem sorteio (igual no servidor e no navegador)", () => {
    expect(shuffled(["right", "wrong"], 5)).toEqual(shuffled(["right", "wrong"], 5));
    const firsts = quickQuestions(base).map((_, index) => shuffled(["right", "wrong"], (index + 3) * 8)[0]);
    expect(new Set(firsts).size).toBe(2);
  });
});

describe("treino obrigatório", () => {
  it("vale para quem registra entradas, menos quem administra o acesso", () => {
    expect(gateTrainingRequired(ROLE_PRESETS.SECURITY)).toBe(true);
    expect(gateTrainingRequired(ROLE_PRESETS.ATTENDANT)).toBe(true);
    expect(gateTrainingRequired(ROLE_PRESETS.ADMIN)).toBe(false);
    const viewOnly: AccessMap = {
      modules: Object.fromEntries(ACCESS_MODULES.map((m) => [m, m === "portaria" ? "view" : "none"])) as AccessMap["modules"],
      fullCpf: false,
      gateCourtesy: false,
    };
    expect(gateTrainingRequired(viewOnly)).toBe(false);
  });
});
