import { describe, expect, it } from "vitest";
import { ACCESS_MODULES, type AccessMap, ROLE_PRESETS } from "@/domain/access";
import { tutorialSteps } from "@/domain/tutorial";

const ids = (access: AccessMap) => tutorialSteps(access, "Maria Souza").map((step) => step.id);

describe("tutorial do primeiro acesso", () => {
  it("cada perfil vê só as fases do que usa", () => {
    expect(ids(ROLE_PRESETS.SECURITY)).toEqual(["boas-vindas", "portaria", "treino", "pronto"]);
    expect(ids(ROLE_PRESETS.ATTENDANT)).toEqual(["boas-vindas", "placar", "inscricoes", "fichas", "vouchers", "portaria", "treino", "mesa", "na-festa", "pronto"]);
    // Mesa dos kits: não registra entradas, então pula a portaria e o treino dela.
    expect(ids(ROLE_PRESETS.KIT_DESK)).toEqual(["boas-vindas", "mesa", "na-festa", "pronto"]);
    expect(ids(ROLE_PRESETS.ADMIN)).toEqual([
      "boas-vindas",
      "placar",
      "inscricoes",
      "fichas",
      "vouchers",
      "portaria",
      "treino",
      "mesa",
      "na-festa",
      "casa",
      "administracao",
      "pronto",
    ]);
  });

  it("abre pelo primeiro nome e ensina o que a pessoa pode fazer (e o que não pode)", () => {
    const [welcome] = tutorialSteps(ROLE_PRESETS.ATTENDANT, "  Maria  Souza");
    expect(welcome?.title).toBe("Bem-vindo(a) à equipe, Maria!");

    const attendant = tutorialSteps(ROLE_PRESETS.ATTENDANT, "Maria Souza");
    const queue = attendant.find((step) => step.id === "inscricoes")!;
    expect(queue.bullets.join(" ")).toContain("toque em Confirmar");
    // Sem tempo de conferir: a fila inteira de uma vez, e o caminho para desfazer quem não for filiado(a).
    expect(queue.bullets.join(" ")).toContain("Confirmar todas");
    expect(queue.bullets.join(" ")).toContain("Não é filiado(a)");
    expect(queue.bullets.join(" ")).toContain("Cadastrar na hora");
    expect(queue.bullets.join(" ")).toContain("level up");
    expect(attendant.find((step) => step.id === "portaria")!.bullets.join(" ")).toContain("Confirmar entrada");

    // Portaria só para consultar: o tutorial não promete o botão de confirmar.
    const viewOnly: AccessMap = {
      modules: Object.fromEntries(ACCESS_MODULES.map((m) => [m, m === "portaria" ? "view" : "none"])) as AccessMap["modules"],
      fullCpf: false,
      gateCourtesy: false,
    };
    const gate = tutorialSteps(viewOnly, "Vera Lima").find((step) => step.id === "portaria")!;
    expect(gate.bullets.join(" ")).toContain("só para consultar");
    expect(gate.bullets.join(" ")).not.toContain("Confirmar entrada");
    // Quem só consulta não tem o treino (ele é de quem registra entradas).
    expect(ids(viewOnly)).not.toContain("treino");
  });

  it("quem registra entradas ganha a fase do treino, com o botão para treinar", () => {
    const training = tutorialSteps(ROLE_PRESETS.SECURITY, "Rui Porto").find((step) => step.id === "treino")!;
    expect(training.action).toEqual({ href: "/portaria/treino", label: "Treinar agora" });
    expect(training.title).toBe("Treino relâmpago");
    // Para a Segurança é obrigatório (antes de abrir a portaria).
    expect(training.bullets.join(" ")).toContain("obrigatório");
  });

  it("toda fase tem título e pelo menos uma explicação", () => {
    for (const step of tutorialSteps(ROLE_PRESETS.ADMIN, "Ana")) {
      expect(step.title.length, step.id).toBeGreaterThan(3);
      expect(step.bullets.length, step.id).toBeGreaterThan(0);
    }
  });
});
