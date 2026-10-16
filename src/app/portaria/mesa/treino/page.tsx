import type { Metadata } from "next";
import { DeskTraining } from "@/components/desk/training/desk-training";
import { getConfig, getEventInfo } from "@/server/queries/config";
import { hasMinorKit } from "@/server/services/desk-kit";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Treino da mesa" };

/** Treino da mesa dos kits: entregas de mentira (nada é gravado), obrigatório antes de abrir a mesa. */
export default async function DeskTrainingPage() {
  const actor = await requirePageActor("deliverKits");
  const [event, config] = await Promise.all([getEventInfo(), getConfig()]);
  return (
    <DeskTraining
      required={actor.deskTrainingPending}
      context={{ kitDeadline: event?.kitDeadline?.label ?? null, minorKit: hasMinorKit(config) }}
    />
  );
}
