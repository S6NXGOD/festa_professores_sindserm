import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EDITION, EDITIONS, editionIdFrom } from "@/domain/edition";
import { sameEnoughName } from "@/server/services/prior-affiliation";

describe("edição da festa (um sistema por festa)", () => {
  it("sem a variável, é a festa das professoras e professores, com os textos de sempre", () => {
    expect(editionIdFrom(undefined)).toBe("professores");
    expect(editionIdFrom("qualquer")).toBe("professores");
    expect(editionIdFrom("servidores")).toBe("servidores");
    expect(EDITION.id).toBe("professores");
    const { terms, game } = EDITIONS.professores;
    expect(terms.personAffiliated).toBe("Professor(a) filiado(a)");
    expect(terms.people).toBe("professoras e professores");
    expect(game.player).toEqual({ 1: "PLAYER 1", 2: "PLAYER 2" });
    expect(EDITIONS.professores.askTeacher).toBe(true);
    expect(EDITIONS.professores.defaultEventName).toBe("Festa das Professoras e Professores – SINDSERMTHE");
    expect(EDITIONS.professores.emblem).toMatchObject({ raster: "/brand/festa-emblema.jpg", transparent: false });
  });

  it("festa das servidoras e servidores: linguagem inclusiva, todo filiado(a) com kit e o tema de verão", () => {
    const servidores = EDITIONS.servidores;
    expect(servidores.askTeacher).toBe(false);
    expect(servidores.theme).toBe("verao");
    expect(servidores.terms.people).toBe("servidoras e servidores");
    expect(servidores.terms.ofPerson).toBe("do(a) servidor(a)");
    expect(servidores.game.player[1]).toBe("TITULAR");
    expect(servidores.emblem).toMatchObject({ raster: "/brand/servidores/emblema.png", transparent: true });
    expect(servidores.tagline).toBe("Quem luta não fica na sombra!");
    expect(servidores.defaultEventName).toBe("Festa das Servidoras e Servidores – SINDSERMTHE");
    // Mesmas chaves nas duas edições: nenhum texto fica faltando.
    expect(Object.keys(servidores.terms).sort()).toEqual(Object.keys(EDITIONS.professores.terms).sort());
    expect(Object.keys(servidores.game).sort()).toEqual(Object.keys(EDITIONS.professores.game).sort());
    for (const value of Object.values(servidores.terms)) expect(value.toLowerCase()).not.toContain("professor");
  });

  it("a arte de cada festa existe (voucher em imagem, relatório em PDF e ícone; a do site é importada e o build confere)", () => {
    for (const edition of Object.values(EDITIONS)) {
      expect(existsSync(join(process.cwd(), "public", edition.emblem.raster)), edition.emblem.raster).toBe(true);
    }
  });
});

describe("filiação conferida em outra festa: mesmo nome?", () => {
  it("aceita nome do meio a mais ou a menos, sem acento e sem maiúsculas", () => {
    expect(sameEnoughName("Maria Souza", "MARIA APARECIDA DE SOUZA")).toBe(true);
    expect(sameEnoughName("José Antônio Lima", "jose lima")).toBe(true);
  });
  it("recusa outro primeiro ou último nome", () => {
    expect(sameEnoughName("Maria Souza", "Mariana Souza")).toBe(false);
    expect(sameEnoughName("Maria Souza", "Maria Silva")).toBe(false);
    expect(sameEnoughName("", "Maria Silva")).toBe(false);
  });
});
