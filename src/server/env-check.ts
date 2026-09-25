import { publicBaseUrl } from "./public-url";

/**
 * Confere, ao ligar o servidor em produção, as variáveis sem as quais o sistema
 * não funciona. Mensagens em português no log do Railway, em vez de erros
 * soltos na primeira pessoa que tentar entrar.
 */
export function checkProductionEnv(): string[] {
  const problems: string[] = [];
  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL: conecte o banco (no Railway: ${{Postgres.DATABASE_URL}}).");
  }
  if ((process.env.BETTER_AUTH_SECRET ?? "").length < 32) {
    problems.push("BETTER_AUTH_SECRET: segredo com 32 caracteres ou mais (gere com npm run env:secrets).");
  }
  if (Buffer.from(process.env.DATA_ENCRYPTION_KEY ?? "", "base64").length !== 32) {
    problems.push(
      "DATA_ENCRYPTION_KEY: chave de 32 bytes em base64 (gere com npm run env:secrets). Guarde-a: sem ela, vouchers e documentos não abrem.",
    );
  }
  const url = publicBaseUrl();
  if (!url) {
    problems.push("BETTER_AUTH_URL: endereço público do sistema (https://...). No Railway, gere um domínio para o serviço.");
  } else if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    problems.push(`BETTER_AUTH_URL: use https:// em produção (hoje: ${url}).`);
  }
  return problems;
}
