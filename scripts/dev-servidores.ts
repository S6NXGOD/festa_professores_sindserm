/**
 * A festa das servidoras e servidores no computador: o mesmo sistema, na
 * edição de verão, com um banco só dela (<nome>_servidores), criado e
 * atualizado sozinho. Os dados da festa dos professores (npm run dev) ficam
 * como estão.
 *
 *   npm run dev:servidores              → http://localhost:3000
 *   npm run dev:servidores -- -p 3001   → outra porta
 *
 * Primeiro acesso ao banco novo: /setup com o SETUP_TOKEN do .env.local.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { runMigrations } from "../src/server/db/migrations";
import { ensureDatabase } from "./db-create";
import { databaseNameOf, loadLocalEnv, withDatabaseName } from "./load-env";

async function main() {
  loadLocalEnv();
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL não configurada: rode npm run env:init (veja o README).");
  const url = withDatabaseName(base, `${databaseNameOf(base)}_servidores`);
  const created = await ensureDatabase(url);
  await runMigrations(url);
  console.log(`[servidores] Banco "${databaseNameOf(url)}" ${created ? "criado e atualizado" : "atualizado"}. Primeiro acesso: /setup com o SETUP_TOKEN do .env.local.`);

  const next = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, NEXT_PUBLIC_FESTA_EDICAO: "servidores" },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
