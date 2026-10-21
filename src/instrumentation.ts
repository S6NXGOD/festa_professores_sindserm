/**
 * Roda uma vez quando o servidor liga. Em produção, confere a configuração e
 * para com uma mensagem clara se faltar algo essencial (o Railway mantém a
 * versão anterior no ar quando o deploy novo não passa na verificação). Depois
 * deixa o banco pronto (migrations e primeiro administrador), mesmo que o
 * pre-deploy não tenha rodado. No computador (npm run dev) também: um banco
 * local parado numa versão antiga ("coluna ... não existe") se atualiza sozinho.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { prepareDatabase } = await import("./server/db/prepare");
  const log = (message: string) => console.log(`[banco] ${message}`);
  if (process.env.NODE_ENV !== "production") {
    try {
      await prepareDatabase(log);
    } catch (error) {
      console.error(
        `[banco] Não deu para atualizar o banco local (${error instanceof Error ? error.message : String(error)}). Confira o DATABASE_URL do .env.local e se o PostgreSQL está ligado.`,
      );
    }
    return;
  }
  const { checkProductionEnv } = await import("./server/env-check");
  const problems = checkProductionEnv();
  if (problems.length > 0) {
    console.error(["", "Configuração incompleta para produção:", ...problems.map((problem) => `  - ${problem}`), ""].join("\n"));
    throw new Error("Variáveis de ambiente faltando ou inválidas (veja a lista acima).");
  }
  await prepareDatabase(log);
}
