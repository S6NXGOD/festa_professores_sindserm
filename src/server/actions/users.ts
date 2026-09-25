"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { homePathFor } from "@/domain/access";
import { type ChangeOwnPasswordInput, changeOwnPasswordSchema, type CreateUserInput, type UpdateUserInput } from "@/domain/schemas";
import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/server/auth";
import { DomainError } from "@/server/services/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { createStaffUser, markPasswordChanged, resetStaffPassword, updateStaffUser } from "@/server/services/users";
import { getActor, requireActionActor } from "@/server/session";
import { runAction } from "./result";

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
