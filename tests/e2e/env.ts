import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Carrega .env.local para descobrir o servidor PostgreSQL (sem sobrescrever o ambiente).
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

function e2eDatabaseUrl() {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("Configure DATABASE_URL no .env.local para rodar os testes E2E.");
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, "")}_e2e`;
  return url.toString();
}

export const E2E = {
  port: Number(process.env.E2E_PORT ?? 3210),
  databaseUrl: e2eDatabaseUrl(),
  setupToken: "e2e-setup-token-0123456789",
  get baseURL() {
    return `http://localhost:${this.port}`;
  },
};
