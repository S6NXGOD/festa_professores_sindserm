import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/**
 * Carrega .env.local/.env para scripts de linha de comando (o Next.js já faz
 * isso sozinho). Variáveis já definidas no ambiente têm precedência.
 */
export function loadLocalEnv(files: string[] = [".env.local", ".env"]) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    const parsed = parseEnv(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
    }
  }
}

/** Troca o nome do banco em uma URL do PostgreSQL (ex.: sindserm_festa -> sindserm_festa_test). */
export function withDatabaseName(url: string, databaseName: string) {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

export function databaseNameOf(url: string) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}
