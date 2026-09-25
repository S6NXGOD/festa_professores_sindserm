import "server-only";
import { ZodError } from "zod";
import { runMigrations } from "./migrations";

type Log = (message: string) => void;

/**
 * Deixa o banco pronto: aplica as migrations pendentes e, num banco sem nenhum
 * usuário, cria o primeiro administrador (ADMIN_EMAIL + ADMIN_PASSWORD).
 * Roda no pre-deploy do Railway e de novo quando o servidor liga (tudo é
 * idempotente), então o sistema nunca entra no ar com o banco sem tabelas.
 */
export async function prepareDatabase(log: Log = console.log) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  await runMigrations(url, { log });
  log(`Banco "${decodeURIComponent(new URL(url).pathname.slice(1))}" atualizado (migrations aplicadas).`);
  await ensureFirstAdmin(log);
}

/**
 * Nunca derruba o deploy: se não der para criar o administrador (ex.: senha
 * curta), o motivo vai para o log e o sistema continua no ar — dá para corrigir
 * a variável e fazer outro deploy, ou criar pelo /setup com o SETUP_TOKEN.
 */
async function ensureFirstAdmin(log: Log) {
  const { db } = await import("@/server/db");
  const { countUsers, createAdminFromCli } = await import("@/server/services/users");
  if ((await countUsers(db)) > 0) return;
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    log("Nenhum usuário ainda: defina ADMIN_EMAIL e ADMIN_PASSWORD (10+ caracteres) ou crie o administrador em /setup com o SETUP_TOKEN.");
    return;
  }
  try {
    const created = await createAdminFromCli({ name: process.env.ADMIN_NAME?.trim() || "Administrador SINDSERM", email, password });
    log(`Primeiro administrador criado: ${created.email}. Entre, troque a senha em /conta e apague ADMIN_PASSWORD das variáveis.`);
  } catch (error) {
    log(
      `ATENÇÃO: administrador NÃO criado (${describe(error)}). Corrija ADMIN_EMAIL/ADMIN_PASSWORD e faça novo deploy, ou crie em /setup com o SETUP_TOKEN.`,
    );
  }
}

function describe(error: unknown) {
  if (error instanceof ZodError) return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  const fieldErrors = (error as { fieldErrors?: Record<string, string> }).fieldErrors;
  if (fieldErrors) return Object.values(fieldErrors).join("; ");
  return error instanceof Error ? error.message : String(error);
}
