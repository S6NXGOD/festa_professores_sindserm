import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./tests/e2e/env";

/**
 * Teste E2E contra um build de produção, usando um banco separado (<nome>_e2e)
 * que é recriado a cada execução.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E.baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx scripts/e2e-prepare.ts && npx next build && npx next start --port ${E2E.port}`,
    url: `${E2E.baseURL}/entrar`,
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: "pipe",
    env: {
      DATABASE_URL: E2E.databaseUrl,
      BETTER_AUTH_URL: E2E.baseURL,
      SETUP_TOKEN: E2E.setupToken,
      RATE_LIMIT_DISABLED: "true",
      NEXT_TELEMETRY_DISABLED: "1",
      // O servidor cria o primeiro administrador ao ligar se isso existir; o teste cria pelo /setup.
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
    },
  },
});
