/**
 * Roda uma vez quando o servidor liga. Em produção, confere a configuração e
 * para com uma mensagem clara se faltar algo essencial (o Railway mantém a
 * versão anterior no ar quando o deploy novo não passa na verificação).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkProductionEnv } = await import("./server/env-check");
  const problems = checkProductionEnv();
  if (problems.length > 0) {
    console.error(["", "Configuração incompleta para produção:", ...problems.map((problem) => `  - ${problem}`), ""].join("\n"));
    throw new Error("Variáveis de ambiente faltando ou inválidas (veja a lista acima).");
  }
}
