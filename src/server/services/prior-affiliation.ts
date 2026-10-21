import "server-only";
import { eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { priorAffiliation, registration } from "@/server/db/schema";
import { toSearchText } from "@/lib/text";
import type { Actor } from "./actor";
import { writeAudit } from "./audit";

/**
 * Mesmo nome? Primeiro e último nome iguais (sem acento, sem maiúsculas):
 * aceita "Maria Souza" e "Maria Aparecida Souza", recusa nomes diferentes.
 */
export function sameEnoughName(a: string, b: string): boolean {
  const words = (name: string) => toSearchText(name).split(" ").filter((word) => word.length > 1);
  const left = words(a);
  const right = words(b);
  if (!left.length || !right.length) return false;
  return left[0] === right[0] && left[left.length - 1] === right[right.length - 1];
}

/**
 * Inscrição nova de quem já teve a filiação conferida em outra festa (pelo
 * pacote de mudança): confirma na hora. Nome diferente do conferido: fica para
 * a conferência, com o recado para a equipe olhar o documento.
 */
export async function applyPriorAffiliation(
  tx: Tx,
  actor: Actor,
  registrationId: string,
  cpf: string | null,
  fullName: string,
  mode: "confirm" | "note" = "confirm",
): Promise<boolean> {
  if (!cpf) return false;
  const [prior] = await tx.select().from(priorAffiliation).where(eq(priorAffiliation.cpf, cpf)).limit(1);
  if (!prior) return false;
  if (!sameEnoughName(prior.fullName, fullName)) {
    await tx
      .update(registration)
      .set({ statusNote: `CPF com filiação conferida na ${prior.source}, mas com outro nome (${prior.fullName}): confira o documento.` })
      .where(eq(registration.id, registrationId));
    return false;
  }
  // Só o recado (ex.: convidado que se declara filiado: o Confirmar da equipe também desfaz o vínculo de convidado).
  if (mode === "note") {
    await tx
      .update(registration)
      .set({ statusNote: `Filiação já conferida na ${prior.source} (RG e contracheque): pode confirmar.` })
      .where(eq(registration.id, registrationId));
    return false;
  }
  await tx
    .update(registration)
    .set({
      status: "CONFIRMED",
      statusChangedAt: new Date(),
      statusChangedByUserId: null,
      statusNote: `Filiação já conferida na ${prior.source} (RG e contracheque).`,
    })
    .where(eq(registration.id, registrationId));
  await writeAudit(tx, actor, {
    action: "AFFILIATION_PRIOR_CONFIRMED",
    entityType: "registration",
    entityId: registrationId,
    summary: `Filiação de ${fullName} confirmada na hora: já tinha sido conferida na ${prior.source}.`,
    after: { source: prior.source, confirmedAt: prior.confirmedAt.toISOString() },
  });
  return true;
}
