"use server";

import { revalidatePath } from "next/cache";
import type { PreAffiliationInput, RegistrationInput } from "@/domain/schemas";
import type { ActionResult } from "@/lib/action-result";
import { PUBLIC_ACTOR } from "@/server/services/actor";
import { enforceRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { createPreAffiliation, createRegistration } from "@/server/services/registration";
import { clientIp, requireActionActor } from "@/server/session";
import { runAction } from "./result";

/** Inscrição feita pelo(a) próprio(a) filiado(a) no formulário público. */
export async function submitPublicRegistration(
  input: RegistrationInput,
): Promise<ActionResult<{ accessToken: string }>> {
  return runAction(async () => {
    await enforceRateLimit(RATE_LIMITS.publicRegistration, await clientIp());
    const created = await createRegistration(PUBLIC_ACTOR, input);
    return { accessToken: created.accessToken };
  });
}

/** Quem ainda não é filiado(a) preenche a ficha antes da festa (assina na recepção). */
export async function submitPublicPreAffiliation(
  input: PreAffiliationInput,
): Promise<ActionResult<{ accessToken: string }>> {
  return runAction(async () => {
    await enforceRateLimit(RATE_LIMITS.publicRegistration, await clientIp());
    const created = await createPreAffiliation(PUBLIC_ACTOR, input);
    return { accessToken: created.accessToken };
  });
}

/** Cadastro na hora feito pelo Atendimento (ignora o período de inscrições). */
export async function submitStaffRegistration(
  input: RegistrationInput,
): Promise<ActionResult<{ accessToken: string; registrationId: string }>> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const created = await createRegistration(actor, input);
    revalidatePath("/painel", "layout");
    return { accessToken: created.accessToken, registrationId: created.registrationId };
  });
}
