"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { homePathFor } from "@/domain/access";
import { type ChangeOwnPasswordInput, changeOwnPasswordSchema, type CreateUserInput, type UpdateUserInput } from "@/domain/schemas";
import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/server/auth";
import { DomainError } from "@/server/services/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import {
  createStaffUser,
  deleteStaffUser,
  finishDeskTraining,
  finishGateTraining,
  markPasswordChanged,
  markTutorialSeen,
  requireGateTrainingAgain,
  resetStaffPassword,
  updateStaffUser,
} from "@/server/services/users";
import { db } from "@/server/db";
import { getActor, requireActionActor } from "@/server/session";
import { runAction } from "./result";

/** O tutorial do primeiro acesso foi concluído (ou pulado): não abre mais sozinho para esta pessoa. */
export async function finishTutorialAction(): Promise<ActionResult> {
  return runAction(async () => {
    await markTutorialSeen(db, await requireActionActor());
  });
}

/** Treino relâmpago da portaria terminado: a portaria abre para esta pessoa. */
export async function finishGateTrainingAction(): Promise<ActionResult> {
  return runAction(async () => {
    await finishGateTraining(db, await requireActionActor());
    revalidatePath("/portaria", "layout");
  });
}

/** Treino da mesa dos kits terminado (a entrega do treino não grava nada; só que a pessoa treinou). */
export async function finishDeskTrainingAction(): Promise<ActionResult> {
  return runAction(async () => {
    await finishDeskTraining(db, await requireActionActor());
    revalidatePath("/portaria", "layout");
  });
}

/** Pede o treino relâmpago de novo a todo mundo que registra entradas (fora os administradores). */
export async function requireGateTrainingAgainAction(): Promise<ActionResult<{ people: number }>> {
  return runAction(async () => {
    const result = await requireGateTrainingAgain(await requireActionActor());
    revalidatePath("/painel/usuarios");
    return result;
  });
}

/** Apaga um usuário (quem tem histórico sai da lista e perde o acesso; o nome fica nos registros). */
export async function deleteUserAction(input: { userId: string }): Promise<ActionResult<{ keptInHistory: boolean }>> {
  return runAction(async () => {
    const result = await deleteStaffUser(await requireActionActor(), input);
    revalidatePath("/painel/usuarios");
    return result;
  });
}

export async function createUserAction(input: CreateUserInput): Promise<ActionResult<{ userId: string }>> {
  return runAction(async () => {
    const result = await createStaffUser(await requireActionActor(), input);
    revalidatePath("/painel/usuarios");
    return result;
  });
}

export async function updateUserAction(input: UpdateUserInput): Promise<ActionResult> {
  return runAction(async () => {
    await updateStaffUser(await requireActionActor(), input);
    revalidatePath("/painel/usuarios");
  });
}

export async function resetPasswordAction(input: { userId: string; password: string }): Promise<ActionResult> {
  return runAction(async () => {
    await resetStaffPassword(await requireActionActor(), input);
    revalidatePath("/painel/usuarios");
  });
}

/**
 * A pessoa troca a própria senha (inclusive a provisória do primeiro acesso).
 * As outras sessões dela são encerradas; esta continua aberta.
 */
export async function changeOwnPasswordAction(input: ChangeOwnPasswordInput): Promise<ActionResult<{ home: string }>> {
  return runAction(async () => {
    const actor = await requireActionActor({ passwordChange: true });
    await enforceRateLimit(RATE_LIMITS.passwordChange, actor.userId);
    const data = changeOwnPasswordSchema.parse(input);
    try {
      await auth.api.changePassword({
        body: { currentPassword: data.currentPassword, newPassword: data.newPassword, revokeOtherSessions: true },
        headers: await headers(),
      });
    } catch {
      throw new DomainError("VALIDATION", "Senha atual incorreta.", { currentPassword: "Senha atual incorreta" });
    }
    await markPasswordChanged(actor);
    return { home: homePathFor(actor.access) };
  });
}

/**
 * Para onde ir logo depois do login: a criação da senha (senha provisória), o
 * endereço pedido ou, sem pedido, a primeira área que a pessoa pode ver.
 */
export async function postLoginDestinationAction(requested: string | null): Promise<string> {
  const actor = await getActor();
  if (!actor) return "/entrar";
  if (actor.mustChangePassword) return "/conta?nova-senha=1";
  const safe = typeof requested === "string" && requested.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/\\");
  return safe ? requested : homePathFor(actor.access);
}
