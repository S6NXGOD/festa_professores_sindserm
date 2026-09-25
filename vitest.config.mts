import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

// Carrega .env.local sem sobrescrever variáveis já definidas no ambiente.
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) return "";
  const url = new URL(process.env.DATABASE_URL);
  // Os testes usam um banco separado (<nome>_test).
  url.pathname = `${url.pathname.replace(/\/$/, "")}_test`;
  return url.toString();
}

const databaseUrl = testDatabaseUrl();

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    setupFiles: ["tests/helpers/setup-file.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      SETUP_TOKEN: "token-de-setup-para-testes",
      RATE_LIMIT_DISABLED: "true",
      NEXT_PUBLIC_APP_TIME_ZONE: "America/Sao_Paulo",
    },
  },
});
