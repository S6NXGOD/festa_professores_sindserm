import { Client } from "pg";
import { ensureDatabase } from "./db-create";
import { databaseNameOf, loadLocalEnv } from "./load-env";
import { runMigrations } from "./migrate";

/** Prepara o banco dos testes E2E: cria, migra e esvazia todas as tabelas. */
async function main() {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  if (!databaseNameOf(url).endsWith("_e2e")) throw new Error("Por segurança, o banco E2E precisa terminar com _e2e.");
  await ensureDatabase(url);
  await runMigrations(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // Todas as tabelas, inclusive as que vierem depois: nada de uma rodada (ou de um teste à mão) vaza para a próxima.
    const { rows } = await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
    if (rows.length) await client.query(`TRUNCATE TABLE ${rows.map((row) => `"${row.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
  console.log(`Banco E2E pronto: ${databaseNameOf(url)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
