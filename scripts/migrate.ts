import { pathToFileURL } from "node:url";
import { runMigrations } from "../src/server/db/migrations";
import { databaseNameOf, loadLocalEnv } from "./load-env";

export { runMigrations };

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
