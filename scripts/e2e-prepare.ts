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
    await client.query(`
      TRUNCATE TABLE audit_log, rate_limit, kit_delivery, check_in, voucher, employee, affiliation_document, affiliation_form,
        guest_link, registration, person, kit_stock, event_photo, event_config, verification, session, account, "user"
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await client.end();
  }
  console.log(`Banco E2E pronto: ${databaseNameOf(url)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
