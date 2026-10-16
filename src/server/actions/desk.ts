"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/domain/rules";
import type { ActionResult } from "@/lib/action-result";
import { db } from "@/server/db";
import { parseQrPayload } from "@/server/crypto";
import { assertPermission, type StaffActor } from "@/server/services/actor";
import { type DeskDeliveryResult, type DeskView, deliverAtDesk, loadDeskView } from "@/server/services/desk";
import { DomainError } from "@/server/services/errors";
import { type PersonSearchResult, searchPeople } from "@/server/services/people";
import { enforceRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { updateKitDeskSettings } from "@/server/services/settings";
import { findVoucherByCode, findVoucherByToken } from "@/server/services/vouchers";
import { requireActionActor } from "@/server/session";
import { runAction } from "./result";

export type DeskLookup =
  | { kind: "FOUND"; view: DeskView }
  | { kind: "REVOKED"; revokedAt: Date }
  | { kind: "NOT_FOUND" }
  | { kind: "INVALID" };

/** Quem está na mesa dos kits: entrega kits ("Kits e estoque: editar"). */
async function deskActor(): Promise<StaffActor> {
  const actor = await requireActionActor();
  assertPermission(actor, "deliverKits");
  await enforceRateLimit(RATE_LIMITS.gateLookup, actor.userId);
  return actor;
}

async function viewOf(actor: StaffActor, personId: string): Promise<DeskView> {
  const view = await loadDeskView(db, personId, actor.access);
  if (!view) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
  return view;
}

/** Busca por nome, CPF ou código do voucher (a mesma da portaria). */
export async function deskSearchAction(query: string): Promise<ActionResult<PersonSearchResult[]>> {
  return runAction(async () => {
    const actor = await deskActor();
    return searchPeople(db, String(query ?? ""), { mode: "auto", fullCpf: can(actor.access, "viewFullCpf"), limit: 12 });
  });
}

export async function deskViewAction(personId: string): Promise<ActionResult<DeskView>> {
  return runAction(async () => viewOf(await deskActor(), String(personId)));
}

/** QR do voucher lido na mesa: só identifica a pessoa (não entrega nada). */
export async function deskScanAction(raw: string): Promise<ActionResult<DeskLookup>> {
  return runAction(async () => {
    const actor = await deskActor();
    const token = parseQrPayload(String(raw ?? ""));
    const found = token ? await findVoucherByToken(db, token) : null;
    if (!token) return { kind: "INVALID" };
    if (!found) return { kind: "NOT_FOUND" };
    if (found.revokedAt) return { kind: "REVOKED", revokedAt: found.revokedAt };
    return { kind: "FOUND", view: await viewOf(actor, found.personId) };
  });
}

/** Código curto do voucher digitado na mesa. */
export async function deskCodeAction(code: string): Promise<ActionResult<DeskLookup>> {
  return runAction(async () => {
    const actor = await deskActor();
    const found = await findVoucherByCode(db, String(code ?? ""));
    if (!found) return { kind: "NOT_FOUND" };
    if (found.revokedAt) return { kind: "REVOKED", revokedAt: found.revokedAt };
    return { kind: "FOUND", view: await viewOf(actor, found.personId) };
  });
}

/** Entrega o kit na mesa: baixa no estoque e registro da entrega (não sai de novo). */
export async function deliverAtDeskAction(input: {
  personId: string;
  leftover?: boolean;
}): Promise<ActionResult<{ delivered: DeskDeliveryResult; view: DeskView }>> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const delivered = await deliverAtDesk(actor, { personId: String(input.personId), leftover: input.leftover === true });
    const view = await viewOf(actor, String(input.personId));
    revalidatePath("/painel", "layout");
    return { delivered, view };
  });
}

/** Configurações: onde o kit sai (portaria ou mesa) e a gordura (inscrições na hora). */
export async function updateKitDeskSettingsAction(input: { kitsAtDesk: boolean; extraTotal: number }): Promise<ActionResult<{ moved: number }>> {
  return runAction(async () => {
    const result = await updateKitDeskSettings(await requireActionActor(), {
      kitsAtDesk: input.kitsAtDesk === true,
      extraTotal: Number(input.extraTotal),
    });
    revalidatePath("/painel", "layout");
    revalidatePath("/portaria", "layout");
    return result;
  });
}
