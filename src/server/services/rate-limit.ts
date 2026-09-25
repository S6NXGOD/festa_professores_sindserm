import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { keyedHash } from "@/server/crypto";
import { DomainError } from "./errors";

export interface RateLimitRule {
  /** Identifica o recurso limitado, ex.: "public-registration". */
  scope: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  // Escolas costumam compartilhar o mesmo IP público: limite generoso, mas finito.
  publicRegistration: { scope: "public-registration", limit: 30, windowSeconds: 600 },
  // Cada ficha envia de 2 a 8 arquivos (RG frente/verso, contracheque): limite folgado por IP.
  documentUpload: { scope: "document-upload", limit: 120, windowSeconds: 600 },
  voucherView: { scope: "voucher-view", limit: 120, windowSeconds: 600 },
  bootstrap: { scope: "bootstrap", limit: 10, windowSeconds: 900 },
  gateLookup: { scope: "gate-lookup", limit: 240, windowSeconds: 300 },
  sensitiveWrite: { scope: "sensitive-write", limit: 120, windowSeconds: 60 },
  // Troca da própria senha: pede a senha atual, então poucas tentativas por pessoa.
  passwordChange: { scope: "password-change", limit: 8, windowSeconds: 600 },
} satisfies Record<string, RateLimitRule>;

/**
 * Janela fixa armazenada no PostgreSQL (funciona com várias instâncias).
 * O identificador (IP, usuário) é convertido em HMAC antes de ser gravado.
 */
export async function consumeRateLimit(rule: RateLimitRule, identifier: string) {
  if (process.env.RATE_LIMIT_DISABLED === "true") return { allowed: true, retryAfterSeconds: 0 };
  const key = `${rule.scope}:${keyedHash(identifier, "rate-limit")}`;
  const result = await db.execute<{ count: number; retry_after: number }>(sql`
    INSERT INTO rate_limit (key, count, reset_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${rule.windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit.reset_at <= now() THEN 1 ELSE rate_limit.count + 1 END,
      reset_at = CASE WHEN rate_limit.reset_at <= now()
        THEN now() + make_interval(secs => ${rule.windowSeconds})
        ELSE rate_limit.reset_at END
    RETURNING count, CEIL(EXTRACT(EPOCH FROM (reset_at - now())))::int AS retry_after
  `);
  const row = result.rows[0];
  if (Math.random() < 0.02) {
    await db.execute(sql`DELETE FROM rate_limit WHERE reset_at < now() - interval '1 hour'`);
  }
  const count = Number(row?.count ?? 0);
  return { allowed: count <= rule.limit, retryAfterSeconds: Math.max(1, Number(row?.retry_after ?? 1)) };
}

export async function enforceRateLimit(rule: RateLimitRule, identifier: string) {
  const { allowed, retryAfterSeconds } = await consumeRateLimit(rule, identifier);
  if (!allowed) {
    const minutes = Math.ceil(retryAfterSeconds / 60);
    throw new DomainError(
      "RATE_LIMITED",
      `Muitas tentativas em sequência. Tente novamente em ${minutes} minuto${minutes > 1 ? "s" : ""}.`,
    );
  }
}
