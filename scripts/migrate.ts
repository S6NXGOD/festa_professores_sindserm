import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { databaseNameOf, loadLocalEnv } from "./load-env";

/** Aplica as migrations SQL da pasta ./drizzle no banco informado. */
export async function runMigrations(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}

async function main() {
  loadLocalEnv();
  const url = process.argv[2] ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  await runMigrations(url);
  console.log(`Migrations aplicadas em "${databaseNameOf(url)}".`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
