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
 * A senha nunca aparece no log e é gravada só como hash (scrypt).
 */
import { databaseNameOf, loadLocalEnv } from "./load-env";
import { runMigrations } from "./migrate";

async function main() {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  await runMigrations(url);
  console.log(`Banco "${databaseNameOf(url)}" atualizado (migrations aplicadas).`);

  // Depois de carregar o ambiente: o pool do banco lê DATABASE_URL ao ser criado.
  const { countUsers, createAdminFromCli } = await import("../src/server/services/users");
  const { db, pool } = await import("../src/server/db");
  try {
    if ((await countUsers(db)) > 0) {
      console.log("Já existem usuários: nenhum administrador foi criado.");
      return;
    }
    const email = process.env.ADMIN_EMAIL?.trim();
    const password = process.env.ADMIN_PASSWORD ?? "";
    if (!email || !password) {
      console.log(
        "Nenhum usuário ainda. Defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o primeiro administrador no próximo deploy, ou crie pelo navegador em /setup (com o SETUP_TOKEN).",
      );
      return;
    }
    const created = await createAdminFromCli({ name: process.env.ADMIN_NAME?.trim() || "Administrador SINDSERM", email, password });
    console.log(`Primeiro administrador criado: ${created.email}. Entre, troque a senha em /conta e apague ADMIN_PASSWORD das variáveis.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const fieldErrors = (error as { fieldErrors?: Record<string, string> }).fieldErrors;
  console.error(error instanceof Error ? error.message : error, fieldErrors ?? "");
  process.exit(1);
});
