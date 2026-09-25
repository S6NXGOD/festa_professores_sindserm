import { Client } from "pg";
import { pathToFileURL } from "node:url";
import { databaseNameOf, loadLocalEnv, withDatabaseName } from "./load-env";

/** Cria o banco da URL informada caso ainda não exista. */
export async function ensureDatabase(databaseUrl: string) {
  const name = databaseNameOf(databaseUrl);
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Nome de banco inválido: ${name}`);
  const admin = new Client({ connectionString: withDatabaseName(databaseUrl, "postgres") });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (rowCount) return false;
    await admin.query(`CREATE DATABASE "${name}" ENCODING 'UTF8'`);
    return true;
  } finally {
    await admin.end();
  }
}

async function main() {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const targets = [url];
  if (process.argv.includes("--with-test")) {
    const base = databaseNameOf(url);
    targets.push(withDatabaseName(url, `${base}_test`), withDatabaseName(url, `${base}_e2e`));
  }
  for (const target of targets) {
    const created = await ensureDatabase(target);
    console.log(`${databaseNameOf(target)}: ${created ? "criado" : "já existia"}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
