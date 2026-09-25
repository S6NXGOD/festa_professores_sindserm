/**
 * Preparo do banco a cada deploy (no Railway, é o "pre-deploy command").
 *
 *   npm run db:deploy
 *
 * 1. Aplica as migrations (as que já foram aplicadas são puladas).
 * 2. Banco sem nenhum usuário e com ADMIN_EMAIL + ADMIN_PASSWORD definidos:
 *    cria o primeiro administrador (ADMIN_NAME é opcional). Se já existe
 *    usuário, não mexe em nada — a senha trocada em /conta continua valendo.
 *
 * O servidor repete esse preparo ao ligar (src/instrumentation.ts): o sistema
 * fica certo mesmo que este passo não rode. Falha nas migrations interrompe o
 * deploy; problema só na criação do administrador vira aviso no log.
 * A senha nunca aparece no log e é gravada só como hash (scrypt).
 */
import { loadLocalEnv } from "./load-env";

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  // Depois de carregar o ambiente: o pool do banco lê DATABASE_URL ao ser criado.
  const { prepareDatabase } = await import("../src/server/db/prepare");
  try {
    await prepareDatabase();
  } finally {
    const { pool } = await import("../src/server/db");
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
