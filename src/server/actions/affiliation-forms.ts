"use server";

import { revalidatePath } from "next/cache";
import type { AffiliationFormInput } from "@/domain/schemas";
import type { ActionResult } from "@/lib/action-result";
import { removeDocument } from "@/server/services/documents";
import { cancelAffiliationForm, formalizeAffiliation, saveAffiliationForm } from "@/server/services/membership";
import { requireActionActor } from "@/server/session";
import { runAction } from "./result";

export async function saveAffiliationFormAction(
  input: AffiliationFormInput,
  formId?: string | null,
): Promise<ActionResult<{ formId: string; personId: string }>> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const result = await saveAffiliationForm(actor, input, formId ?? null);
    revalidatePath("/painel", "layout");
    return result;
  });
}

export async function formalizeAffiliationAction(
  formId: string,
): Promise<ActionResult<{ registrationId: string; personId: string; accessToken: string | null; hostName: string | null }>> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const result = await formalizeAffiliation(actor, String(formId));
    revalidatePath("/painel", "layout");
    revalidatePath("/portaria", "layout");
    return {
      registrationId: result.registrationId,
      personId: result.personId,
      accessToken: result.accessToken,
      hostName: result.conversion?.hostName ?? null,
    };
  });
}

export async function cancelAffiliationFormAction(formId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    await cancelAffiliationForm(actor, String(formId));
    revalidatePath("/painel", "layout");
  });
}

/** Apaga um documento anexado (ex.: foto ilegível, para enviar outra). */
export async function removeDocumentAction(documentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    await removeDocument(actor, String(documentId));
    revalidatePath("/painel", "layout");
    revalidatePath("/portaria", "layout");
  });
}
