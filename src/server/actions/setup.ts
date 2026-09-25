"use server";

import { revalidatePath } from "next/cache";
import {
  type BootstrapAdminInput,
  type EventSettingsInput,
  eventSettingsSchema,
  type HelpSettingsInput,
  helpSettingsSchema,
  type SetupInput,
  setupSchema,
  type StockSettingsInput,
  stockSettingsSchema,
  type VenueSettingsInput,
  venueSettingsSchema,
} from "@/domain/schemas";
import type { ActionResult } from "@/lib/action-result";
import { enforceRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { completeSetup, updateEventSettings, updateHelpSettings, updateStockSettings, updateShareMessage } from "@/server/services/settings";
import { removeSiteIcon } from "@/server/services/site-icon";
import { removeEventPhoto, updateVenueSettings } from "@/server/services/venue";
import { bootstrapFirstAdmin } from "@/server/services/users";
import { clientIp, requireActionActor } from "@/server/session";
import { runAction } from "./result";

/** Cria o primeiro administrador (apenas quando não há usuários). */
export async function bootstrapAdminAction(input: BootstrapAdminInput): Promise<ActionResult<{ userId: string }>> {
  return runAction(async () => {
    await enforceRateLimit(RATE_LIMITS.bootstrap, await clientIp());
    return bootstrapFirstAdmin(input);
  });
}

export async function completeSetupAction(input: SetupInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const data = setupSchema.parse(input);
    await completeSetup(actor, data);
    revalidatePath("/", "layout");
  });
}

export async function updateEventSettingsAction(input: EventSettingsInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    await updateEventSettings(actor, eventSettingsSchema.parse(input));
    revalidatePath("/", "layout");
  });
}

export async function updateHelpSettingsAction(input: HelpSettingsInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    await updateHelpSettings(actor, helpSettingsSchema.parse(input));
    revalidatePath("/", "layout");
  });
}

export async function updateShareMessageAction(message: string | null): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    await updateShareMessage(actor, typeof message === "string" ? message : null);
    revalidatePath("/painel");
  });
}

export async function updateStockSettingsAction(input: StockSettingsInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    await updateStockSettings(actor, stockSettingsSchema.parse(input));
    revalidatePath("/painel", "layout");
  });
}

export async function updateVenueSettingsAction(input: VenueSettingsInput): Promise<ActionResult<{ mapsUrl: string | null }>> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const saved = await updateVenueSettings(actor, venueSettingsSchema.parse(input));
    revalidatePath("/", "layout");
    return { mapsUrl: saved.venueMapsUrl };
  });
}

export async function removeEventPhotoAction(): Promise<ActionResult> {
  return runAction(async () => {
    await removeEventPhoto(await requireActionActor());
    revalidatePath("/", "layout");
  });
}

/** Ícone do site volta a ser o emblema da festa. */
export async function removeSiteIconAction(): Promise<ActionResult> {
  return runAction(async () => {
    await removeSiteIcon(await requireActionActor());
    revalidatePath("/", "layout");
  });
}
