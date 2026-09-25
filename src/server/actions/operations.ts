"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import type { AddGuestInput, DeclaredMemberInput, PersonCorrectionInput, TeacherStatusInput } from "@/domain/schemas";
import type { AffiliationStatus, KitType } from "@/domain/types";
import type { ActionResult } from "@/lib/action-result";
import { escapeLike, toSearchText } from "@/lib/text";
import { db } from "@/server/db";
import { guestLink, person, registration } from "@/server/db/schema";
import { confirmAfterProof, decideAffiliation, reopenAffiliation } from "@/server/services/affiliation";
import { assertPermission } from "@/server/services/actor";
import { cancelCheckIn } from "@/server/services/checkin";
import { addGuest, removeGuest, setTeacherStatus } from "@/server/services/group";
import { cancelKitDelivery, deliverKit, type DeliveryResult } from "@/server/services/kits";
import { registerDeclaredMember } from "@/server/services/membership";
import { correctPerson } from "@/server/services/people";
import { DomainError } from "@/server/services/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { renewRegistrationAccess } from "@/server/services/registration";
import { reissueVoucher } from "@/server/services/vouchers";
import { requireActionActor } from "@/server/session";
import { runAction } from "./result";

const sqlHasGuest = sql<boolean>`EXISTS (SELECT 1 FROM ${guestLink} gl WHERE gl.registration_id = ${registration.id} AND gl.status = 'ACTIVE')`;

async function staff() {
  const actor = await requireActionActor();
  await enforceRateLimit(RATE_LIMITS.sensitiveWrite, actor.userId);
  return actor;
}

function refreshStaffViews() {
  revalidatePath("/painel", "layout");
  revalidatePath("/portaria", "layout");
}

export async function decideAffiliationAction(input: {
  registrationId: string;
  decision: "CONFIRM" | "REJECT";
  note?: string | null;
}): Promise<ActionResult<{ status: AffiliationStatus; hostName: string | null }>> {
  return runAction(async () => {
    const result = await decideAffiliation(await staff(), {
      registrationId: String(input.registrationId),
      decision: input.decision === "CONFIRM" ? "CONFIRM" : "REJECT",
      note: input.note ?? null,
    });
    refreshStaffViews();
    return { status: result.status, hostName: result.conversion?.hostName ?? null };
  });
}

export async function confirmAfterProofAction(input: { registrationId: string; justification: string }): Promise<ActionResult> {
  return runAction(async () => {
    await confirmAfterProof(await staff(), { registrationId: String(input.registrationId), justification: String(input.justification) });
    refreshStaffViews();
  });
}

export async function reopenAffiliationAction(input: { registrationId: string; justification: string }): Promise<ActionResult> {
  return runAction(async () => {
    await reopenAffiliation(await staff(), input);
    refreshStaffViews();
  });
}

export async function deliverKitAction(input: { personId: string; kitType: KitType }): Promise<ActionResult<DeliveryResult>> {
  return runAction(async () => {
    const kitType: KitType = input.kitType === "GUEST" || input.kitType === "EMPLOYEE" ? input.kitType : "MEMBER";
    const result = await deliverKit(await staff(), { personId: String(input.personId), kitType });
    refreshStaffViews();
    return result;
  });
}

export async function cancelDeliveryAction(input: { deliveryId: string; justification: string }): Promise<ActionResult> {
  return runAction(async () => {
    await cancelKitDelivery(await staff(), input);
    refreshStaffViews();
  });
}

export async function cancelCheckInAction(input: { personId: string; justification: string }): Promise<ActionResult> {
  return runAction(async () => {
    await cancelCheckIn(await staff(), input);
    refreshStaffViews();
  });
}

/** Cadastra (ou troca) o convidado de um(a) professor(a). */
export async function addGuestAction(
  input: AddGuestInput,
): Promise<ActionResult<{ personId: string; name: string; reusedPerson: boolean; replaced: boolean }>> {
  return runAction(async () => {
    const result = await addGuest(await staff(), input);
    refreshStaffViews();
    return { personId: result.personId, name: result.name, reusedPerson: result.reusedPerson, replaced: result.replaced };
  });
}

/** Vincula uma pessoa já cadastrada (ex.: filiação não confirmada) como convidada de um(a) professor(a). */
export async function linkPersonAsGuestAction(input: {
  personId: string;
  registrationId: string;
}): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const actor = await staff();
    const [target] = await db
      .select({ fullName: person.fullName, isMinor: person.isMinor })
      .from(person)
      .where(eq(person.id, String(input.personId)));
    if (!target) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
    // Vincula pela identidade da pessoa (funciona também para quem não tem CPF).
    const result = await addGuest(actor, {
      registrationId: String(input.registrationId),
      personId: String(input.personId),
      fullName: target.fullName,
      cpf: "",
      isMinor: target.isMinor,
    });
    refreshStaffViews();
    return { name: result.name };
  });
}

export async function removeGuestAction(input: { guestLinkId: string }): Promise<ActionResult> {
  return runAction(async () => {
    await removeGuest(await staff(), { guestLinkId: String(input.guestLinkId) });
    refreshStaffViews();
  });
}

export async function setTeacherStatusAction(input: TeacherStatusInput): Promise<ActionResult> {
  return runAction(async () => {
    await setTeacherStatus(await staff(), input);
    refreshStaffViews();
  });
}

export async function registerDeclaredMemberAction(
  input: DeclaredMemberInput,
): Promise<ActionResult<{ registrationId: string }>> {
  return runAction(async () => {
    const result = await registerDeclaredMember(await staff(), input);
    refreshStaffViews();
    return { registrationId: result.registrationId };
  });
}

export async function correctPersonAction(input: PersonCorrectionInput): Promise<ActionResult> {
  return runAction(async () => {
    await correctPerson(await staff(), input);
    refreshStaffViews();
  });
}

export async function reissueVoucherAction(personId: string): Promise<ActionResult<{ code: string }>> {
  return runAction(async () => {
    const result = await reissueVoucher(await staff(), String(personId));
    refreshStaffViews();
    return { code: result.code };
  });
}

export async function renewAccessAction(registrationId: string): Promise<ActionResult<{ accessToken: string }>> {
  return runAction(async () => {
    const result = await renewRegistrationAccess(await staff(), String(registrationId));
    return result;
  });
}

export interface MemberOption {
  registrationId: string;
  fullName: string;
  status: AffiliationStatus;
  hasGuest: boolean;
}

/** Busca professoras e professores filiados(as) que podem receber um convidado. */
export async function searchMembersAction(query: string): Promise<ActionResult<MemberOption[]>> {
  return runAction(async () => {
    const actor = await requireActionActor();
    assertPermission(actor, "manageGuests");
    const text = String(query ?? "").trim();
    const digits = text.replace(/\D/g, "");
    const terms = toSearchText(text).split(" ").filter((t) => t.length >= 2);
    if (!terms.length && digits.length < 3) return [];
    const condition =
      digits.length >= 3 && !/\p{L}/u.test(text)
        ? like(person.cpf, `%${digits}%`)
        : and(...terms.map((t) => like(person.searchName, `%${escapeLike(t)}%`)));
    const rows = await db
      .select({
        registrationId: registration.id,
        fullName: person.fullName,
        status: registration.status,
        hasGuest: sqlHasGuest,
      })
      .from(registration)
      .innerJoin(person, eq(person.id, registration.memberPersonId))
      .where(
        and(
          condition,
          eq(registration.isTeacher, true),
          inArray(registration.status, ["PENDING", "AWAITING_SIGNATURE", "CONFIRMED", "JOINED_AT_EVENT"]),
        ),
      )
      .orderBy(asc(person.searchName))
      .limit(10);
    return rows.map((r) => ({ ...r, hasGuest: Boolean(r.hasGuest) }));
  });
}
