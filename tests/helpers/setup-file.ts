import { afterAll } from "vitest";

afterAll(async () => {
  const holder = globalThis as unknown as { __festaPgPool?: { end: () => Promise<void> } };
  if (holder.__festaPgPool) {
    const pool = holder.__festaPgPool;
    delete holder.__festaPgPool;
    await pool.end();
  }
});
