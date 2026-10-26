/*
 * Kits que uma inscrição nova ainda consegue garantir (a conta é do servidor,
 * em services/kit-waitlist): o formulário de inscrição avisa quando os kits
 * acabaram e a pessoa confirma que entra na fila do kit.
 */

import { EDITION } from "./edition";

export interface KitSupply {
  /** Estoque único: o kit do(a) professor(a) e o do convidado saem do mesmo saldo. */
  shared: boolean;
  /** Kits sem dono para uma inscrição nova (null = estoque sem limite cadastrado: não há fila). */
  member: number | null;
  guest: number | null;
  /** Quantos já esperam na fila de cada kit (no estoque único, a mesma fila). */
  queue: { member: number; guest: number };
  /** Kits guardados até este horário; depois, as sobras saem por ordem de chegada (null = sem horário). */
  reservedUntil?: { label: string; passed: boolean } | null;
  /** Inscrição na hora (as inscrições já fecharam): o kit sai da gordura, que ainda tem `free` kits livres. */
  extra?: { free: number } | null;
}

export type KitOutcome = "KIT" | "WAITLIST";

export interface KitOutlook {
  member: KitOutcome | null;
  guest: KitOutcome | null;
  /** Lugar provável na fila (null = não vai para a fila). */
  position: { member: number | null; guest: number | null };
}

/**
 * O que acontece com os kits de quem se inscreve agora: a mesma ordem da decisão
 * no servidor. Kit dividido (`sharedKit`): o convidado não tem kit próprio.
 */
export function kitOutlook(
  supply: KitSupply | null,
  wants: { teacher: boolean; guest: boolean },
  sharedKit: boolean = EDITION.sharedKit,
): KitOutlook {
  const outlook: KitOutlook = { member: null, guest: null, position: { member: null, guest: null } };
  if (!wants.teacher) return outlook;
  let member = supply?.member ?? null;
  let guest = supply?.guest ?? null;
  let queueMember = supply?.queue.member ?? 0;
  let queueGuest = supply?.queue.guest ?? 0;

  if (member === null || member >= 1) {
    outlook.member = "KIT";
    if (member !== null) member -= 1;
    if (supply?.shared && guest !== null) guest -= 1;
  } else {
    outlook.member = "WAITLIST";
    outlook.position.member = queueMember + 1;
    queueMember += 1;
    if (supply?.shared) queueGuest += 1;
  }
  if (wants.guest && !sharedKit) {
    if (guest === null || guest >= 1) {
      outlook.guest = "KIT";
    } else {
      outlook.guest = "WAITLIST";
      outlook.position.guest = queueGuest + 1;
    }
  }
  return outlook;
}

/** Os kits já estão todos com os inscritos (quem se inscrever agora entra na fila do kit). */
export function kitsSoldOut(supply: KitSupply | null): boolean {
  return Boolean(supply && supply.member !== null && supply.member < 1);
}
