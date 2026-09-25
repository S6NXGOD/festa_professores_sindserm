/**
 * Endereço público do sistema (login, cookies e links). Vem do BETTER_AUTH_URL;
 * no Railway, sem ele, usa o domínio que o Railway gera para o serviço
 * (RAILWAY_PUBLIC_DOMAIN). Com domínio próprio, defina o BETTER_AUTH_URL.
 */
export function publicBaseUrl(): string | undefined {
  const explicit = process.env.BETTER_AUTH_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  return railway ? `https://${railway}` : undefined;
}
