import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { can, homePathFor, type Permission, resolveAccess } from "@/domain/access";
import { STAFF_ROLES } from "@/domain/types";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import type { StaffActor } from "@/server/services/actor";
import { DomainError } from "@/server/services/errors";

export { homePathFor };

/** Sessão atual (deduplicada por requisição). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export interface SessionActor extends StaffActor {
  /** Senha provisória (dada pelo administrador): a pessoa cria a própria antes de usar o sistema. */
  mustChangePassword: boolean;
}

export const getActor = cache(async (): Promise<SessionActor | null> => {
  const session = await getSession();
  if (!session) return null;
  // Perfil, permissões e senha provisória vêm sempre do banco: uma mudança do administrador vale na hora.
  const [row] = await db
    .select({
      name: user.name,
      role: user.role,
      active: user.active,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
    })
    .from(user)
    .where(eq(user.id, session.user.id));
  if (!row?.active || !STAFF_ROLES.includes(row.role)) return null;
  return {
    kind: "staff",
    userId: session.user.id,
    name: row.name,
    role: row.role,
    access: resolveAccess(row.role, row.permissions),
    mustChangePassword: row.mustChangePassword,
  };
});

/**
 * Para páginas: redireciona ao login, à criação da senha (senha provisória) ou
 * à primeira área que a pessoa pode ver.
 */
export async function requirePageActor(permission?: Permission, options: { passwordChange?: boolean } = {}): Promise<SessionActor> {
  const actor = await getActor();
  if (!actor) redirect("/entrar");
  if (actor.mustChangePassword && !options.passwordChange) redirect("/conta?nova-senha=1");
  if (permission && !can(actor.access, permission)) redirect(homePathFor(actor.access));
  return actor;
}

/** Para server actions: erro de domínio em vez de redirecionamento. */
export async function requireActionActor(options: { passwordChange?: boolean } = {}): Promise<SessionActor> {
  const actor = await getActor();
  if (!actor) throw new DomainError("UNAUTHENTICATED", "Sua sessão expirou. Faça login novamente.");
  if (actor.mustChangePassword && !options.passwordChange) {
    throw new DomainError("FORBIDDEN", "Crie a sua senha antes de continuar (Minha conta).");
  }
  return actor;
}

function trustedProxyHops(): number {
  const value = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "", 10);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : 1;
}

/**
 * IP do cliente apenas para rate limiting (nunca é gravado em claro).
 * Cada proxy acrescenta ao X-Forwarded-For o endereço de quem o chamou, então o
 * IP confiável é o N-ésimo a partir da direita (N = proxies confiáveis). Valores
 * mais à esquerda podem ter sido forjados pelo próprio cliente.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const entries = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const forwarded = entries.length > 0 ? entries[Math.max(0, entries.length - trustedProxyHops())] : undefined;
  return forwarded || h.get("x-real-ip")?.trim() || "local";
}
