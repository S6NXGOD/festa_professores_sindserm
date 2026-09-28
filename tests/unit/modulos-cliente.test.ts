/**
 * Página do servidor não pode ler valores (constantes, tabelas de estilo) de um
 * módulo "use client": ela só recebe uma referência vazia e o valor some sem erro
 * (foi assim que os avatares coloridos sumiram). Componentes podem ser importados.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const isClient = (source: string) => /^\s*["']use client["']/.test(source);
const aliasOf = (file: string) => "@/" + path.relative(SRC, file).split(path.sep).join("/").replace(/\.(ts|tsx)$/, "");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, (c) => `\\${c}`);

describe("módulos de cliente", () => {
  it("nenhum módulo do servidor importa valores (que não sejam componentes) de um módulo \"use client\"", () => {
    const files = sourceFiles(SRC);
    const clientValues = new Map<string, string[]>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!isClient(source)) continue;
      // CONSTANTE_EM_MAIÚSCULAS ou valorComMinúscula: componentes começam com maiúscula e têm minúsculas.
      const names = [...source.matchAll(/export const ([A-Za-z0-9_]+)/g)]
        .map((match) => match[1]!)
        .filter((name) => /^[A-Z0-9_]+$/.test(name) || /^[a-z]/.test(name));
      if (names.length) clientValues.set(aliasOf(file), names);
    }
    const problems: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (isClient(source)) continue;
      for (const [module, names] of clientValues) {
        const match = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escape(module)}["']`).exec(source);
        if (!match) continue;
        const imported = match[1]!.split(",").map((part) => part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!);
        for (const name of imported.filter((n) => names.includes(n))) {
          problems.push(`${path.relative(SRC, file)} importa ${name} de ${module}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
