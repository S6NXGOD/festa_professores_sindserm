import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __festaPgPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada. Veja o README (.env.local).");
  }
  return new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    // Sem conexão livre em 15 s: erro claro em vez de uma tela "carregando" para sempre.
    connectionTimeoutMillis: 15_000,
  });
}

// Reaproveita o pool entre recargas do servidor de desenvolvimento.
export const pool = globalForDb.__festaPgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__festaPgPool = pool;

export const db = drizzle({ client: pool, schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Qualquer executor de consultas: o banco ou uma transação aberta. */
export type Executor = Db | Tx;
