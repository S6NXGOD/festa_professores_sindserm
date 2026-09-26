/**
 * Menu x páginas x perfis: ninguém vê um item que o manda de volta para o
 * início, toda página confere o acesso e os ajustes antigos continuam valendo.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACCESS_MODULES, MODULE_INFO, ROLE_PRESETS, can, homePathFor, resolveAccess, type AccessMap } from "@/domain/access";
import { PANEL_NAV } from "@/domain/nav";

const APP = path.join(process.cwd(), "src", "app");
const NAV_ITEMS = PANEL_NAV.flatMap((group) => group.items);

function pageFor(href: string) {
  return path.join(APP, ...href.split("/").filter(Boolean), "page.tsx");
}

function pagesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pagesUnder(full);
    return name === "page.tsx" ? [full] : [];
  });
}

function visibleLabels(access: AccessMap) {
  return NAV_ITEMS.filter((item) => can(access, item.permission)).map((item) => item.label);
}

/** Acesso só a uma área, no nível mais alto que ela aceita. */
function onlyModule(area: (typeof ACCESS_MODULES)[number]): AccessMap {
  const levels = MODULE_INFO[area].levels;
  const modules = Object.fromEntries(ACCESS_MODULES.map((m) => [m, m === area ? levels[levels.length - 1] : "none"]));
  return { modules: modules as AccessMap["modules"], fullCpf: false };
}

describe("menu do painel", () => {
  it("cada item pede exatamente a permissão que a página dele exige", () => {
    for (const item of NAV_ITEMS) {
      const source = readFileSync(pageFor(item.href), "utf8");
      expect(source, item.href).toContain(`requirePageActor("${item.permission}")`);
      // O atalho para a fila é a mesma página, só com o filtro.
      if (item.queueHref) expect(item.queueHref.startsWith(`${item.href}?filtro=`), item.queueHref).toBe(true);
    }
  });

  it("toda página do painel e da portaria confere o acesso (ou só redireciona para uma que confere)", () => {
    const pages = [...pagesUnder(path.join(APP, "painel")), ...pagesUnder(path.join(APP, "portaria"))];
    expect(pages.length).toBeGreaterThan(15);
    for (const file of pages) {
      const source = readFileSync(file, "utf8");
      const guarded = source.includes("requirePageActor(");
      const onlyRedirects = source.includes("redirect(") && !source.includes("return (");
      expect(guarded || onlyRedirects, path.relative(APP, file)).toBe(true);
    }
  });

  it("cada perfil vê só o que consegue abrir", () => {
    expect(visibleLabels(ROLE_PRESETS.ADMIN)).toHaveLength(NAV_ITEMS.length);
    expect(visibleLabels(ROLE_PRESETS.ATTENDANT)).toEqual(["Placar", "Portaria", "Entradas", "Kits e estoque", "Inscrições", "Fichas de filiação"]);
    expect(visibleLabels(ROLE_PRESETS.SECURITY)).toEqual(["Portaria"]);
    expect(can(ROLE_PRESETS.SECURITY, "viewPanel")).toBe(false);
  });

  it("com acesso a uma área só, a pessoa cai numa tela que ela pode abrir", () => {
    for (const area of ACCESS_MODULES) {
      const access = onlyModule(area);
      const home = homePathFor(access);
      if (home === "/conta") {
        // Correções não tem tela própria: são botões dentro das outras telas.
        expect(area).toBe("correcoes");
        continue;
      }
      const item = NAV_ITEMS.find((entry) => entry.href === home);
      expect(item, `${area} → ${home}`).toBeTruthy();
      expect(can(access, item!.permission), `${area} → ${home}`).toBe(true);
      if (home.startsWith("/painel")) expect(can(access, "viewPanel"), area).toBe(true);
    }
  });
});

describe("áreas unificadas", () => {
  it("o cadastro de cada pessoa faz parte de Inscrições; a busca rápida vale para Portaria ou Inscrições", () => {
    const registrationsOnly = onlyModule("inscricoes");
    expect(can(registrationsOnly, "viewPeople")).toBe(true);
    expect(can(registrationsOnly, "search")).toBe(true);
    expect(can(registrationsOnly, "checkIn")).toBe(false);
    const gateViewOnly = { ...onlyModule("portaria"), modules: { ...onlyModule("portaria").modules, portaria: "view" as const } };
    expect(can(gateViewOnly, "search")).toBe(true);
    expect(can(gateViewOnly, "viewGate")).toBe(true);
    expect(can(gateViewOnly, "checkIn")).toBe(false);
    expect(can(gateViewOnly, "viewPeople")).toBe(false);
  });

  it("estornos e reaberturas dependem só da área Correções", () => {
    expect(can(ROLE_PRESETS.ADMIN, "adminCorrections")).toBe(true);
    expect(can(ROLE_PRESETS.ATTENDANT, "adminCorrections")).toBe(false);
    expect(can(onlyModule("correcoes"), "adminCorrections")).toBe(true);
    expect(can(onlyModule("inscricoes"), "adminCorrections")).toBe(false);
  });

  it("ajuste gravado antes da unificação continua valendo (Participantes: ver → Inscrições; editar → Correções)", () => {
    // Formato antigo: tinha "participantes" e não tinha "correcoes".
    const old = (participantes: string, extra: Record<string, string> = {}) =>
      JSON.stringify({ modules: { placar: "view", portaria: "edit", kits: "view", inscricoes: "none", fichas: "none", participantes, ...extra }, fullCpf: false });

    const viewer = resolveAccess("ATTENDANT", old("view"));
    expect(viewer.modules.inscricoes).toBe("view");
    expect(viewer.modules.correcoes).toBe("none");
    expect(can(viewer, "viewPeople")).toBe(true);
    expect(can(viewer, "validateAffiliation")).toBe(false);

    const editor = resolveAccess("ATTENDANT", old("edit", { inscricoes: "edit" }));
    expect(editor.modules.inscricoes).toBe("edit");
    expect(editor.modules.correcoes).toBe("edit");
    expect(can(editor, "adminCorrections")).toBe(true);

    // Sem Participantes no ajuste antigo, ninguém ganha nada.
    const none = resolveAccess("SECURITY", old("none"));
    expect(none.modules.inscricoes).toBe("none");
    expect(none.modules.correcoes).toBe("none");

    // Quem já foi ajustado no formato novo não é sobrescrito.
    const explicit = resolveAccess("ATTENDANT", JSON.stringify({ modules: { participantes: "edit", correcoes: "none" }, fullCpf: true }));
    expect(explicit.modules.correcoes).toBe("none");
    expect(Object.keys(explicit.modules)).not.toContain("participantes");
  });
});
