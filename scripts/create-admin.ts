/**
 * Cria um usuário administrador.
 *
 *   npm run admin:create -- --email admin@exemplo.org --name "Nome Sobrenome" [--password "senha"]
 *
 * Sem --password, gera uma senha forte e a exibe uma única vez. A senha nunca é
 * gravada em claro (Better Auth/scrypt).
 */
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { loadLocalEnv } from "./load-env";

const WORDS = ["fita", "disco", "vinil", "neon", "radio", "pista", "danca", "tape", "arcade", "walkman", "luta", "giz"];

function generatePassword(): string {
  const pick = () => WORDS[randomInt(WORDS.length)]!;
  const word = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  return `${word(pick())}-${word(pick())}-${randomInt(1000, 9999)}-${word(pick())}`;
}

async function main() {
  loadLocalEnv();
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
    },
  });
  if (!values.email || !values.name) {
    throw new Error('Uso: npm run admin:create -- --email admin@exemplo.org --name "Nome Sobrenome" [--password "senha"]');
  }
  const password = values.password ?? generatePassword();
  // Importa depois de carregar o .env.local (o pool do banco lê DATABASE_URL ao ser criado).
  const { createAdminFromCli } = await import("../src/server/services/users");
  const { pool } = await import("../src/server/db");
  try {
    const created = await createAdminFromCli({ name: values.name, email: values.email, password });
    console.log("Administrador criado.");
    console.log(`  E-mail: ${created.email}`);
    console.log(`  Senha:  ${password}${values.password ? "" : "  (gerada agora; anote e troque em /conta)"}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const fieldErrors = (error as { fieldErrors?: Record<string, string> }).fieldErrors;
  console.error(message, fieldErrors ?? "");
  process.exit(1);
});
