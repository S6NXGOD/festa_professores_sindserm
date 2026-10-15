import type { Metadata } from "next";
import { GateTraining } from "@/components/gate/training/gate-training";
import { can } from "@/domain/rules";
import { formatClock } from "@/lib/datetime";
import { db } from "@/server/db";
import { getConfig, getEventInfo } from "@/server/queries/config";
import { getKitPlan } from "@/server/services/kit-plan";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Treino da portaria" };

/** Treino de quem registra entradas: as situações da porta, com a tela de verdade e dados de mentira. */
export default async function GateTrainingPage() {
  const actor = await requirePageActor("checkIn");
  const [event, config, plan] = await Promise.all([getEventInfo(), getConfig(), getKitPlan(db)]);
  return (
    <GateTraining
      context={{
        abilities: {
          resolve: can(actor.access, "validateAffiliation"),
          forms: can(actor.access, "newAffiliation"),
          register: can(actor.access, "registerAtEvent"),
          courtesy: can(actor.access, "createCourtesyAtGate"),
        },
        kitDeadline: event?.kitDeadline ? { label: event.kitDeadline.label, at: event.kitDeadline.at.toISOString() } : null,
        startClock: config ? formatClock(config.startTime) : null,
        startsAt: event?.startsAt ? event.startsAt.toISOString() : null,
        minorKit: Boolean(plan?.minor),
      }}
    />
  );
}
