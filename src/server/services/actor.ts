import { ROLE_LABEL } from "@/domain/labels";
import { can, type Permission } from "@/domain/rules";
import type { StaffRole } from "@/domain/types";
import { DomainError } from "./errors";

export interface StaffActor {
  kind: "staff";
  userId: string;
  name: string;
  role: StaffRole;
}

export interface PublicActor {
  kind: "public";
}

export type Actor = StaffActor | PublicActor;

export const PUBLIC_ACTOR: PublicActor = { kind: "public" };

export function actorLabel(actor: Actor): string {
  return actor.kind === "staff" ? `${actor.name} (${ROLE_LABEL[actor.role]})` : "Participante (formulário público)";
}

export function actorUserId(actor: Actor): string | null {
  return actor.kind === "staff" ? actor.userId : null;
}

/** Garante, no servidor, que o ator é da equipe e tem a permissão exigida. */
export function assertPermission(actor: Actor, permission: Permission): asserts actor is StaffActor {
  if (actor.kind !== "staff") {
    throw new DomainError("UNAUTHENTICATED", "Faça login para continuar.");
  }
  if (!can(actor.role, permission)) {
    throw new DomainError("FORBIDDEN", "Seu perfil não tem permissão para esta operação.");
  }
}
