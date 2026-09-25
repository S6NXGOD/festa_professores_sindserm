import { ensureDatabase } from "../../scripts/db-create";
import { databaseNameOf, loadLocalEnv, withDatabaseName } from "../../scripts/load-env";
import { runMigrations } from "../../scripts/migrate";

/** Cria (se preciso) e migra o banco de testes antes da suíte. */
export default async function setup() {
  loadLocalEnv();
  const base = process.env.DATABASE_URL;
  const url = process.env.TEST_DATABASE_URL ?? (base ? withDatabaseName(base, `${databaseNameOf(base)}_test`) : "");
  if (!url) throw new Error("Configure DATABASE_URL no .env.local para rodar os testes.");
  if (!databaseNameOf(url).endsWith("_test")) {
    throw new Error("Por segurança, o banco de testes precisa terminar com _test.");
  }
  await ensureDatabase(url);
  await runMigrations(url);
}
