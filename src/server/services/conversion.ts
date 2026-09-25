import "server-only";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { guestLink } from "@/server/db/schema";
import type { StaffActor } from "./actor";
import { writeAudit } from "./audit";
import { lockEmployeeGroup, lockRegistration } from "./locks";
import { findActiveGuestLink } from "./state";

export interface GuestConversion {
  /** Inscrição do(a) professor(a) que convidou (nulo quando foi um(a) funcionário(a)). */
  hostRegistrationId: string | null;
  hostName: string;
  /** O kit de convidado de quem convidou ainda não tinha sido retirado para esta pessoa. */
  guestKitReleased: boolean;
}

/**
 * Regra especial: convidado que vira filiado (filiação confirmada ou ficha
 * formalizada).
 * - o vínculo de convidado é encerrado como CONVERTED (o histórico de quem
 *   convidou é preservado);
 * - a pessoa deixa de ocupar a vaga de convidado: quem a convidou (professor(a)
 *   ou funcionário(a)) pode chamar outro convidado (e, se o kit de convidado
 *   ainda não saiu, o novo convidado terá direito a ele);
 * - a pessoa (e o CPF) continua a mesma, agora com os próprios direitos.
 */
export async function convertActiveGuestLink(
  tx: Tx,
  actor: StaffActor,
  personId: string,
  newRegistrationId: string,
): Promise<GuestConversion | null> {
  const candidate = await findActiveGuestLink(tx, personId);
  if (!candidate) return null;
  // Trava o grupo de quem convidou antes de mexer no vínculo.
  const host = candidate.registrationId
    ? await lockRegistration(tx, candidate.registrationId).then((state) => ({
        kind: "registration" as const,
        id: state.id,
        name: state.member.fullName,
        guestName: state.guest?.fullName ?? null,
        guestKitOut: Boolean(state.deliveries.GUEST),
      }))
    : await lockEmployeeGroup(tx, candidate.employeeId!).then((state) => ({
        kind: "employee" as const,
        id: state.id,
        name: state.person.fullName,
        guestName: state.guest?.fullName ?? null,
        guestKitOut: Boolean(state.deliveries.GUEST),
      }));
  // Relê o vínculo já com o grupo bloqueado (pode ter sido removido em paralelo).
  const [link] = await tx
    .select({ id: guestLink.id })
    .from(guestLink)
    .where(and(eq(guestLink.id, candidate.id), eq(guestLink.status, "ACTIVE")))
    .for("update");
  if (!link) return null;

  await tx
    .update(guestLink)
    .set({
      status: "CONVERTED",
      endedAt: new Date(),
      endedByUserId: actor.userId,
      endReason: "Passou a ser filiado(a)",
      convertedToRegistrationId: newRegistrationId,
    })
    .where(eq(guestLink.id, link.id));

  const guestKitReleased = !host.guestKitOut;
  await writeAudit(tx, actor, {
    action: "GUEST_PROMOTED",
    entityType: host.kind,
    entityId: host.id,
    summary: `${host.guestName ?? "Convidado(a)"} deixou de ser convidado(a) de ${host.name} e passou a ser filiado(a); a vaga de convidado foi liberada.`,
    after: { newRegistrationId, guestKitReleased },
  });
  return { hostRegistrationId: host.kind === "registration" ? host.id : null, hostName: host.name, guestKitReleased };
}
