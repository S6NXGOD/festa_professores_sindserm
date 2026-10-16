import type { Metadata } from "next";
import { GateTraining } from "@/components/gate/training/gate-training";
import { can } from "@/domain/rules";
import { db } from "@/server/db";
import { getEventInfo } from "@/server/queries/config";
import { getKitPlan } from "@/server/services/kit-plan";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Treino relâmpago" };

/**
 * Treino relâmpago da portaria (1 minuto). Para quem registra entradas (fora os
 * administradores) é obrigatório: a portaria abre só depois dele.
 */
export default async function GateTrainingPage() {
  const actor = await requirePageActor("checkIn");
  const [event, plan] = await Promise.all([getEventInfo(), getKitPlan(db)]);
  return (
    <GateTraining
      required={actor.gateTrainingPending}
      context={{
        resolve: can(actor.access, "validateAffiliation"),
        kitDeadline: event?.kitDeadline?.label ?? null,
        minorKit: Boolean(plan?.minor),
        kitsAtDesk: event?.kitsAtDesk ?? false,
      }}
    />
  );
}
