"use server";

import { revalidatePath } from "next/cache";
import type { CheckInMethod } from "@/domain/types";
import type { ActionResult } from "@/lib/action-result";
import { db } from "@/server/db";
import { parseQrPayload } from "@/server/crypto";
import { assertPermission, type StaffActor } from "@/server/services/actor";
import { type EntryKitResult, registerCheckIn } from "@/server/services/checkin";
import { DomainError } from "@/server/services/errors";
import { type GateView, loadGateView } from "@/server/services/gate-view";
import { type PersonSearchResult, searchPeople } from "@/server/services/people";
import { enforceRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { findVoucherByCode, findVoucherByToken, type VoucherLookup } from "@/server/services/vouchers";
import { can } from "@/domain/rules";
import { requireActionActor } from "@/server/session";
import { runAction } from "./result";

export type LookupResult =
  | { kind: "FOUND"; view: GateView; voucherId: string }
  | { kind: "REVOKED"; revokedAt: Date }
  | { kind: "NOT_FOUND" }
  | { kind: "INVALID" };

async function gateActor(): Promise<StaffActor> {
  const actor = await requireActionActor();
  assertPermission(actor, "checkIn");
  await enforceRateLimit(RATE_LIMITS.gateLookup, actor.userId);
  return actor;
}

async function resolve(actor: StaffActor, found: VoucherLookup | null): Promise<LookupResult> {
  if (!found) return { kind: "NOT_FOUND" };
  if (found.revokedAt) return { kind: "REVOKED", revokedAt: found.revokedAt };
  const view = await loadGateView(db, found.personId, actor.access);
  if (!view) return { kind: "NOT_FOUND" };
  return { kind: "FOUND", view, voucherId: found.voucherId };
}

/** Leitura do QR: apenas identifica a pessoa. Não registra entrada. */
export async function scanQrAction(raw: string): Promise<ActionResult<LookupResult>> {
  return runAction(async () => {
    const actor = await gateActor();
    const token = parseQrPayload(String(raw ?? ""));
    if (!token) return { kind: "INVALID" };
    return resolve(actor, await findVoucherByToken(db, token));
  });
}

/** Busca pelo código curto impresso no voucher. */
export async function lookupCodeAction(code: string): Promise<ActionResult<LookupResult>> {
  return runAction(async () => {
    const actor = await gateActor();
    return resolve(actor, await findVoucherByCode(db, String(code ?? "")));
  });
}

export async function searchPeopleAction(
  query: string,
  mode: "auto" | "name" | "cpf" = "auto",
): Promise<ActionResult<PersonSearchResult[]>> {
  return runAction(async () => {
    const actor = await gateActor();
    return searchPeople(db, String(query ?? ""), { mode, fullCpf: can(actor.access, "viewFullCpf"), limit: 20 });
  });
}

export async function gateViewAction(personId: string): Promise<ActionResult<GateView>> {
  return runAction(async () => {
    const actor = await gateActor();
    const view = await loadGateView(db, String(personId), actor.access);
    if (!view) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
    return view;
  });
}

/** Confirmação explícita da entrada pelo operador. */
export async function confirmEntryAction(input: {
  personId: string;
  method: CheckInMethod;
  voucherId?: string | null;
  /** A portaria viu o aviso "a festa ainda não começou" e confirmou mesmo assim. */
  early?: boolean;
}): Promise<
  ActionResult<{ outcome: "CHECKED_IN" | "ALREADY"; view: GateView; kit: EntryKitResult | null; guestKit: EntryKitResult | null }>
> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const method: CheckInMethod = ["QR", "SEARCH", "CODE"].includes(input.method) ? input.method : "SEARCH";
    const result = await registerCheckIn(actor, {
      personId: String(input.personId),
      method,
      voucherId: input.voucherId ?? null,
      early: input.early === true,
    });
    const view = await loadGateView(db, String(input.personId), actor.access);
    if (!view) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
    revalidatePath("/painel", "layout");
    revalidatePath("/portaria", "layout");
    const entered = result.outcome === "CHECKED_IN";
    return { outcome: result.outcome, view, kit: entered ? result.kit : null, guestKit: entered ? result.guestKit : null };
  });
}
