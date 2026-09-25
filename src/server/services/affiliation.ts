import "server-only";
import { eq } from "drizzle-orm";
import { registration } from "@/server/db/schema";
import { justificationField } from "@/domain/schemas";
import type { AffiliationStatus } from "@/domain/types";
import { normalizeSpaces } from "@/lib/text";
import { type Actor, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { convertActiveGuestLink, type GuestConversion } from "./conversion";
import { DomainError } from "./errors";
import { lockRegistration, lockRegistrationWithPeople } from "./locks";
import { withTx } from "./tx";

export { lockRegistration } from "./locks";

/**
 * Conferência manual da filiação (fila "Aguardando conferência").
 * Segurança não pode confirmar nem rejeitar. Se a pessoa confirmada ainda for
 * convidada de alguém, aplica-se a regra do convidado que vira filiado.
 */
export async function decideAffiliation(
  actor: Actor,
  input: { registrationId: string; decision: "CONFIRM" | "REJECT"; note?: string | null },
): Promise<{ status: AffiliationStatus; conversion: GuestConversion | null }> {
  assertPermission(actor, "validateAffiliation");
  const note = input.note ? normalizeSpaces(input.note).slice(0, 500) || null : null;
  return withTx(async (tx) => {
    const state = await lockRegistration(tx, input.registrationId);
    if (state.status === "AWAITING_SIGNATURE") {
      throw new DomainError("INVALID_STATE", "Esta pessoa preencheu a ficha de filiação: confirme pela assinatura da ficha.");
    }
    if (state.status !== "PENDING") {
      throw new DomainError("INVALID_STATE", "Esta filiação já foi conferida. Atualize a tela.");
    }
    const status: AffiliationStatus = input.decision === "CONFIRM" ? "CONFIRMED" : "REJECTED";
    await tx
      .update(registration)
      .set({ status, statusChangedAt: new Date(), statusChangedByUserId: actor.userId, statusNote: note })
      .where(eq(registration.id, state.id));
    const conversion =
      status === "CONFIRMED" ? await convertActiveGuestLink(tx, actor, state.member.id, state.id) : null;
    await writeAudit(tx, actor, {
      action: status === "CONFIRMED" ? "AFFILIATION_CONFIRMED" : "AFFILIATION_REJECTED",
      entityType: "registration",
      entityId: state.id,
      summary: `${state.member.fullName}: ${status === "CONFIRMED" ? "filiação confirmada" : "filiação não confirmada"}.`,
      before: { status: state.status },
      after: { status, note, conversion },
    });
    return { status, conversion };
  });
}

/**
 * A filiação foi marcada como "não confirmada", mas a pessoa comprova na hora
 * que é filiada (ex.: contracheque com o desconto do SINDSERM). O Atendimento
 * confirma direto, registrando como ela comprovou.
 */
export async function confirmAfterProof(
  actor: Actor,
  input: { registrationId: string; justification: string },
): Promise<{ status: AffiliationStatus; conversion: GuestConversion | null }> {
  assertPermission(actor, "validateAffiliation");
  const justification = justificationField.parse(input.justification);
  return withTx(async (tx) => {
    const state = await lockRegistration(tx, input.registrationId);
    if (state.status !== "REJECTED") {
      throw new DomainError("INVALID_STATE", "Só filiação não confirmada pode ser confirmada por comprovação. Atualize a tela.");
    }
    await tx
      .update(registration)
      .set({ status: "CONFIRMED", statusChangedAt: new Date(), statusChangedByUserId: actor.userId, statusNote: justification })
      .where(eq(registration.id, state.id));
    const conversion = await convertActiveGuestLink(tx, actor, state.member.id, state.id);
    await writeAudit(tx, actor, {
      action: "AFFILIATION_PROVEN",
      entityType: "registration",
      entityId: state.id,
      summary: `${state.member.fullName}: filiação confirmada após comprovação (${justification}).`,
      before: { status: state.status },
      after: { status: "CONFIRMED", justification, conversion },
    });
    return { status: "CONFIRMED", conversion };
  });
}

/** Correção administrativa: volta a conferência para "pendente". */
export async function reopenAffiliation(actor: Actor, input: { registrationId: string; justification: string }) {
  assertPermission(actor, "adminCorrections");
  const justification = justificationField.parse(input.justification);
  return withTx(async (tx) => {
    // Bloqueia também as pessoas do grupo: a regra depende de entradas registradas.
    const state = await lockRegistrationWithPeople(tx, input.registrationId);
    if (state.status !== "CONFIRMED" && state.status !== "REJECTED") {
      throw new DomainError("INVALID_STATE", "Somente filiações confirmadas ou não confirmadas podem ser reabertas.");
    }
    if (state.deliveries.MEMBER || state.deliveries.GUEST) {
      throw new DomainError("INVALID_STATE", "Há kits entregues para este filiado; estorne as entregas antes.");
    }
    if (state.memberCheckIn || state.guest?.checkIn) {
      throw new DomainError("INVALID_STATE", "O filiado ou o convidado já registraram entrada.");
    }
    await tx
      .update(registration)
      .set({ status: "PENDING", statusChangedAt: new Date(), statusChangedByUserId: actor.userId, statusNote: justification })
      .where(eq(registration.id, state.id));
    await writeAudit(tx, actor, {
      action: "AFFILIATION_REOPENED",
      entityType: "registration",
      entityId: state.id,
      summary: `Conferência de ${state.member.fullName} reaberta: ${justification}`,
      before: { status: state.status },
      after: { status: "PENDING" },
    });
  });
}
