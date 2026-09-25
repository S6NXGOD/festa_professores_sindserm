import { type AccessMap, can, type Permission, ROLE_PRESETS } from "@/domain/access";
import { ROLE_LABEL } from "@/domain/labels";
import type { StaffRole } from "@/domain/types";
import { DomainError } from "./errors";

export interface StaffActor {
  kind: "staff";
  userId: string;
  name: string;
  /** Perfil de partida (rótulo e modelo das permissões). */
  role: StaffRole;
  /** O que a pessoa pode fazer, área por área (perfil ou personalizado). */
  access: AccessMap;
}

export interface PublicActor {
  kind: "public";
}

export type Actor = StaffActor | PublicActor;

export const PUBLIC_ACTOR: PublicActor = { kind: "public" };

/** Ator da equipe com as permissões do perfil (scripts e testes). */
export function staffActor(input: { userId: string; name: string; role: StaffRole; access?: AccessMap }): StaffActor {
  return { kind: "staff", userId: input.userId, name: input.name, role: input.role, access: input.access ?? ROLE_PRESETS[input.role] };
}

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
  if (!can(actor.access, permission)) {
    throw new DomainError("FORBIDDEN", "Seu perfil não tem permissão para esta operação.");
  }
}
