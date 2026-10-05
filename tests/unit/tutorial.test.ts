import { describe, expect, it } from "vitest";
import { ACCESS_MODULES, type AccessMap, ROLE_PRESETS } from "@/domain/access";
import { tutorialSteps } from "@/domain/tutorial";

const ids = (access: AccessMap) => tutorialSteps(access, "Maria Souza").map((step) => step.id);

describe("tutorial do primeiro acesso", () => {
  it("cada perfil vê só as fases do que usa", () => {
    expect(ids(ROLE_PRESETS.SECURITY)).toEqual(["boas-vindas", "portaria", "pronto"]);
    expect(ids(ROLE_PRESETS.ATTENDANT)).toEqual(["boas-vindas", "placar", "inscricoes", "fichas", "vouchers", "portaria", "na-festa", "pronto"]);
    expect(ids(ROLE_PRESETS.ADMIN)).toEqual([
      "boas-vindas",
      "placar",
      "inscricoes",
      "fichas",
      "vouchers",
      "portaria",
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
  });

  it("toda fase tem título e pelo menos uma explicação", () => {
    for (const step of tutorialSteps(ROLE_PRESETS.ADMIN, "Ana")) {
      expect(step.title.length, step.id).toBeGreaterThan(3);
      expect(step.bullets.length, step.id).toBeGreaterThan(0);
    }
  });
});
