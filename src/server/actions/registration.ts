"use server";

import { revalidatePath } from "next/cache";
import type { PreAffiliationInput, RegistrationInput, VoucherRecoveryInput } from "@/domain/schemas";
import { normalizeCpf } from "@/lib/cpf";
import type { ActionResult } from "@/lib/action-result";
import { db } from "@/server/db";
import { PUBLIC_ACTOR } from "@/server/services/actor";
import { DomainError } from "@/server/services/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { createPreAffiliation, createRegistration, recoverRegistrationAccess } from "@/server/services/registration";
import { loadRegistrationState } from "@/server/services/state";
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

/**
 * Cadastro rápido na portaria: a mesma inscrição do "Cadastrar na hora"
 * (aguardando conferência), devolvendo a pessoa para abrir direto na conferência.
 */
export async function submitGateRegistration(input: RegistrationInput): Promise<ActionResult<{ personId: string; registrationId: string }>> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const created = await createRegistration(actor, input);
    const state = await loadRegistrationState(db, created.registrationId);
    if (!state) throw new DomainError("NOT_FOUND", "Inscrição não encontrada depois de gravar. Busque a pessoa pelo nome.");
    revalidatePath("/painel", "layout");
    revalidatePath("/portaria", "layout");
    return { personId: state.member.id, registrationId: created.registrationId };
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

/** Perdeu o link dos vouchers? Recupera com o CPF e o WhatsApp da inscrição (link novo). */
export async function recoverVouchers(input: VoucherRecoveryInput): Promise<ActionResult<{ accessToken: string }>> {
  return runAction(async () => {
    await enforceRateLimit(RATE_LIMITS.voucherRecovery, await clientIp());
    // Também por CPF: ninguém fica chutando números de WhatsApp para o CPF de outra pessoa.
    const cpf = normalizeCpf(typeof input?.cpf === "string" ? input.cpf : "");
    if (cpf) await enforceRateLimit(RATE_LIMITS.voucherRecoveryCpf, `cpf:${cpf}`);
    return recoverRegistrationAccess(input);
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
