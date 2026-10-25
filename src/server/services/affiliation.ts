import "server-only";
import { and, count, eq, inArray, lt, sql } from "drizzle-orm";
import { person, registration } from "@/server/db/schema";
import { justificationField } from "@/domain/schemas";
import type { AffiliationStatus } from "@/domain/types";
import { plural } from "@/lib/plural";
import { normalizeSpaces } from "@/lib/text";
import { type Actor, assertPermission } from "./actor";
import { writeAudit, writeAudits } from "./audit";
import { convertActiveGuestLink, type GuestConversion } from "./conversion";
import { DomainError } from "./errors";
import { allocateKitSlots, promoteKitWaitlist } from "./kit-waitlist";
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
    // Filiação não confirmada: os kits que a inscrição guardava vagam e a fila anda.
    if (status === "REJECTED") await promoteKitWaitlist(tx, actor);
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

/** Recado das inscrições confirmadas em massa: dá para saber depois quem não passou pela conferência. */
export const BULK_CONFIRM_NOTE = "Confirmada em massa, sem conferência.";

/**
 * Confirmar de uma vez a fila "Aguardando conferência" (decisão da organização:
 * sem tempo de conferir todo mundo, é melhor não barrar quem é filiado(a); quem
 * o SINDSERM descobrir que não é filiado(a) é desfeito(a) depois, uma pessoa por
 * vez). Só as inscrições que já estavam na fila quando a tela foi aberta: quem
 * chegou depois continua na fila. Convidado(a) que se declarou filiado(a) segue a
 * regra do convidado que vira filiado, como no Confirmar de uma por uma.
 */
export async function confirmPendingInBulk(actor: Actor, input: { upTo: Date }): Promise<{ confirmed: number; stillPending: number }> {
  assertPermission(actor, "validateAffiliation");
  if (Number.isNaN(input.upTo.getTime())) throw new DomainError("VALIDATION", "Atualize a tela e tente de novo.");
  return withTx(async (tx) => {
    const confirmed = await tx
      .update(registration)
      .set({
        status: "CONFIRMED",
        statusChangedAt: new Date(),
        statusChangedByUserId: actor.userId,
        // O recado que já havia (ex.: CPF conferido em outra festa com outro nome) continua junto.
        statusNote: sql`${BULK_CONFIRM_NOTE}::text || coalesce(' ' || ${registration.statusNote}, '')`,
      })
      // A hora da tela vem em milissegundos e a do banco, em microssegundos: o milissegundo da tela vale inteiro.
      .where(and(eq(registration.status, "PENDING"), lt(registration.createdAt, new Date(input.upTo.getTime() + 1))))
      .returning({ id: registration.id, memberPersonId: registration.memberPersonId, origin: registration.origin });
    for (const row of confirmed) {
      if (row.origin === "GUEST_CONVERSION") await convertActiveGuestLink(tx, actor, row.memberPersonId, row.id);
    }
    const people = confirmed.length
      ? await tx
          .select({ id: person.id, fullName: person.fullName })
          .from(person)
          .where(inArray(person.id, confirmed.map((row) => row.memberPersonId)))
      : [];
    const names = new Map(people.map((row) => [row.id, row.fullName]));
    await writeAudits(
      tx,
      actor,
      confirmed.map((row) => ({
        action: "AFFILIATION_CONFIRMED" as const,
        entityType: "registration" as const,
        entityId: row.id,
        summary: `${names.get(row.memberPersonId) ?? "Inscrição"}: filiação confirmada em massa, sem conferência.`,
        before: { status: "PENDING" },
        after: { status: "CONFIRMED", bulk: true },
      })),
    );
    const [rest] = await tx.select({ total: count() }).from(registration).where(eq(registration.status, "PENDING"));
    const stillPending = Number(rest?.total ?? 0);
    if (confirmed.length) {
      await writeAudit(tx, actor, {
        action: "AFFILIATIONS_BULK_CONFIRMED",
        entityType: "event",
        entityId: "1",
        summary: `Confirmação em massa: ${plural(confirmed.length, "inscrição confirmada", "inscrições confirmadas")} sem conferência${
          stillPending ? `; ${plural(stillPending, "chegou depois e continua", "chegaram depois e continuam")} na fila` : ""
        }.`,
        after: { confirmed: confirmed.length, stillPending, upTo: input.upTo.toISOString() },
      });
    }
    return { confirmed: confirmed.length, stillPending };
  });
}

/**
 * O SINDSERM constatou nos sistemas dele que quem foi confirmado(a) (inclusive
 * em massa) não é filiado(a): a filiação é desfeita, e a pessoa não entra nem
 * recebe o kit (o convidado também não entra). Só antes de qualquer entrada ou
 * kit do grupo. Os kits que a inscrição guardava vagam e a fila anda. Se a pessoa
 * comprovar depois, o "Comprovou: confirmar filiação" continua valendo.
 */
export async function revokeAffiliation(actor: Actor, input: { registrationId: string; justification: string }) {
  assertPermission(actor, "validateAffiliation");
  const justification = justificationField.parse(input.justification);
  return withTx(async (tx) => {
    // Bloqueia também as pessoas do grupo: a regra depende de entradas e entregas.
    const state = await lockRegistrationWithPeople(tx, input.registrationId);
    if (state.status !== "CONFIRMED") {
      throw new DomainError("INVALID_STATE", "Só dá para desfazer uma filiação confirmada. Atualize a tela.");
    }
    if (state.memberCheckIn || state.guest?.checkIn) {
      throw new DomainError("INVALID_STATE", "Já entrou na festa (a pessoa ou o convidado): estorne a entrada antes.");
    }
    if (state.deliveries.MEMBER || state.deliveries.GUEST) {
      throw new DomainError("INVALID_STATE", "Já saiu kit para este grupo: estorne a entrega antes.");
    }
    await tx
      .update(registration)
      .set({ status: "REJECTED", statusChangedAt: new Date(), statusChangedByUserId: actor.userId, statusNote: justification })
      .where(eq(registration.id, state.id));
    // Os kits que a inscrição guardava vagam: a fila anda.
    await promoteKitWaitlist(tx, actor);
    await writeAudit(tx, actor, {
      action: "AFFILIATION_REVOKED",
      entityType: "registration",
      entityId: state.id,
      summary: `${state.member.fullName}: não é filiado(a), não entra nem recebe o kit (${justification}).`,
      before: { status: state.status },
      after: { status: "REJECTED", justification },
    });
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
    // Voltou a valer: os kits entram na conta de novo (ou na fila, se acabaram).
    if (state.isTeacher) await allocateKitSlots(tx, actor, state.id, { member: true, guest: Boolean(state.guest) });
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
    // Quem tinha sido recusado(a) volta a pedir os kits (ou entra na fila, se acabaram).
    if (state.status === "REJECTED" && state.isTeacher) {
      await allocateKitSlots(tx, actor, state.id, { member: true, guest: Boolean(state.guest) });
    }
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
