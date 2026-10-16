import { describe, expect, it } from "vitest";
import { deskMissions, searchRoster } from "@/components/desk/training/desk-missions";
import { quickQuestions } from "@/components/gate/training/scenarios";
import { ROLE_PRESETS } from "@/domain/access";
import { deskTrainingRequired, gateTrainingRequired } from "@/domain/tutorial";

describe("treino da mesa dos kits", () => {
  it("as pessoas da mesa: o básico, voucher amarelo, já pegou, não entrou e convidada sozinha (+ menor, se houver kit de menor)", () => {
    expect(deskMissions({ kitDeadline: null, minorKit: false }).map((m) => m.id)).toEqual(["basico", "rapido", "na-hora", "ja-pegou", "nao-entrou", "convidada"]);
    const withMinor = deskMissions({ kitDeadline: "22:00", minorKit: true });
    expect(withMinor.map((m) => m.id)).toContain("menor");
    const walkIn = withMinor.find((m) => m.id === "na-hora")!;
    expect(walkIn.view.walkIn).toBe(true);
    expect(walkIn.action).toEqual({ kind: "deliver", crate: { right: "Caixa da gordura", wrong: "Caixa oficial" } });
    expect(withMinor.find((m) => m.id === "nao-entrou")!.view.kit).toEqual({ kind: "NOT_ENTERED" });
  });

  it("a busca do treino acha pelo nome (sem acento), pelo código do voucher e pelo CPF", () => {
    const missions = deskMissions({ kitDeadline: null, minorKit: false });
    const [basic, walkIn, again] = ["basico", "na-hora", "ja-pegou"].map((id) => missions.find((m) => m.id === id));
    expect(searchRoster(basic!.roster, "ana lima").map((p) => p.personId)).toEqual(["t-ana"]);
    expect(searchRoster(basic!.roster, "Lima").length).toBe(2);
    expect(searchRoster(walkIn!.roster, "z4wd2hne")[0]?.fullName).toBe("Rafael Souza");
    expect(searchRoster(again!.roster, "12345678909")[0]?.fullName).toBe("Beatriz Costa");
    expect(searchRoster(again!.roster, "x")).toEqual([]);
  });

  it("o jeito rápido: a fila tem quem chegou e um nome parecido para conferir", () => {
    const quick = deskMissions({ kitDeadline: null, minorKit: false }).find((m) => m.id === "rapido")!;
    expect(quick.action).toEqual({ kind: "quick" });
    expect(quick.queue?.filter((entry) => entry.right).map((entry) => entry.row.fullName)).toEqual(["João Pedro Alves"]);
    expect(quick.queue?.map((entry) => entry.row.fullName)).toContain("João Paulo Lima");
  });

  it("a mesa dos kits é obrigatória para quem entrega kits (fora os administradores)", () => {
    expect(deskTrainingRequired(ROLE_PRESETS.KIT_DESK)).toBe(true);
    expect(deskTrainingRequired(ROLE_PRESETS.ATTENDANT)).toBe(true);
    expect(deskTrainingRequired(ROLE_PRESETS.SECURITY)).toBe(false);
    expect(deskTrainingRequired(ROLE_PRESETS.ADMIN)).toBe(false);
    expect(gateTrainingRequired(ROLE_PRESETS.KIT_DESK)).toBe(false);
  });

  it("no modo mesa, o treino da portaria manda à mesa e ensina o voucher amarelo", () => {
    const atGate = quickQuestions({ resolve: false, kitDeadline: null, minorKit: true });
    const atDesk = quickQuestions({ resolve: false, kitDeadline: null, minorKit: true, kitsAtDesk: true });
    expect(atGate.map((q) => q.id)).toContain("dois-kits");
    expect(atDesk.map((q) => q.id)).not.toContain("dois-kits");
    expect(atDesk.map((q) => q.id)).not.toContain("menor");
    expect(atDesk.map((q) => q.id)).toContain("na-hora");
    expect(atDesk.find((q) => q.id === "verde")).toMatchObject({ right: "Confirmar a entrada e mandar à mesa dos kits", card: { kit: { kind: "desk" } } });
  });
});
