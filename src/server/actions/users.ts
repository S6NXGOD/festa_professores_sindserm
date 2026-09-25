"use server";

import { revalidatePath } from "next/cache";
import type { CreateUserInput, UpdateUserInput } from "@/domain/schemas";
import type { ActionResult } from "@/lib/action-result";
import { createStaffUser, resetStaffPassword, updateStaffUser } from "@/server/services/users";
import { requireActionActor } from "@/server/session";
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
