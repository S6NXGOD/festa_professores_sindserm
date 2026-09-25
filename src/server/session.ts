import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { can, type Permission } from "@/domain/rules";
import { STAFF_ROLES, type StaffRole } from "@/domain/types";
import { auth } from "@/server/auth";
import type { StaffActor } from "@/server/services/actor";
import { DomainError } from "@/server/services/errors";

/** Sessão atual (deduplicada por requisição). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export const getActor = cache(async (): Promise<StaffActor | null> => {
  const session = await getSession();
  if (!session) return null;
  const { id, name, role, active } = session.user as typeof session.user & { role?: unknown; active?: unknown };
  if (active !== true) return null;
  if (typeof role !== "string" || !STAFF_ROLES.includes(role as StaffRole)) return null;
  return { kind: "staff", userId: id, name, role: role as StaffRole };
});

export function homePathFor(role: StaffRole): string {
  return role === "SECURITY" ? "/portaria" : "/painel";
}

/** Para páginas: redireciona ao login ou à área permitida. */
export async function requirePageActor(permission?: Permission): Promise<StaffActor> {
  const actor = await getActor();
  if (!actor) redirect("/entrar");
  if (permission && !can(actor.role, permission)) redirect(homePathFor(actor.role));
  return actor;
}

/** Para server actions: erro de domínio em vez de redirecionamento. */
export async function requireActionActor(): Promise<StaffActor> {
  const actor = await getActor();
  if (!actor) throw new DomainError("UNAUTHENTICATED", "Sua sessão expirou. Faça login novamente.");
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
