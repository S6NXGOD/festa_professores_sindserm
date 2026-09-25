import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Chave fixa do advisory lock: duas instâncias nunca aplicam migrations ao mesmo tempo. */
const MIGRATION_LOCK_KEY = 7_241_026;

/** Falhas que passam sozinhas: no Railway, a rede privada leva alguns segundos para responder. */
const TRANSIENT_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P03"]);

function isTransient(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  return TRANSIENT_CODES.has(code) || /timeout|terminated/i.test(message);
}

/**
 * Aplica as migrations SQL da pasta ./drizzle (as já aplicadas são puladas).
 * Se o banco ainda não aceita conexões, tenta de novo por cerca de 30 s.
 */
export async function runMigrations(
  databaseUrl: string,
  options: { attempts?: number; log?: (message: string) => void } = {},
) {
  const attempts = options.attempts ?? 10;
  const log = options.log ?? console.log;
  for (let attempt = 1; ; attempt++) {
    const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
    try {
      const client = await pool.connect();
      try {
        await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
        try {
          await migrate(drizzle({ client }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
        } finally {
          await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
        }
      } finally {
        client.release();
      }
      return;
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) throw error;
      log(`Banco ainda indisponível (${error instanceof Error ? error.message : error}); nova tentativa em 3 s.`);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    } finally {
      await pool.end();
    }
  }
}
