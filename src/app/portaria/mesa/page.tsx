import type { Metadata } from "next";
import { DeskScreen } from "@/components/desk/desk-screen";
import { can } from "@/domain/rules";
import { db } from "@/server/db";
import { deskStockOf, listDeskQueue } from "@/server/services/desk";
import { getStockOverview } from "@/server/services/settings";
import { requireDeskActor } from "@/server/session";

export const metadata: Metadata = { title: "Mesa dos kits" };

/**
 * Mesa dos kits: a segurança registra a entrada e a pessoa vem aqui buscar o
 * kit. Quem ainda deve o treino da mesa faz antes (uma entrega de mentira).
 */
export default async function KitDeskPage() {
  const actor = await requireDeskActor();
  const [queue, stock] = await Promise.all([listDeskQueue(db), getStockOverview(db)]);
  return (
    <DeskScreen
      fullCpf={can(actor.access, "viewFullCpf")}
      initial={{
        pending: queue.pending,
        delivered: queue.delivered,
        minorKit: queue.minorKit,
        items: queue.items.map((item) => ({ ...item, checkedInAt: item.checkedInAt.toISOString() })),
        stock: deskStockOf(stock),
      }}
    />
  );
}
