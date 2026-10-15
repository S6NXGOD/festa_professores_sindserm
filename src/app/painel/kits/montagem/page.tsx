import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@/components/icons/pixel";
import { KitPlanStudio } from "@/components/staff/kit-plan-studio";
import { PageHeader } from "@/components/staff/panel-ui";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/rules";
import { db } from "@/server/db";
import { APP_NAME, getConfig } from "@/server/queries/config";
import { getKitCounts, getKitPlan } from "@/server/services/kit-plan";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Montagem e custo dos kits" };

/**
 * O que vem em cada kit e quanto a consumação custa: previsto com os inscritos
 * de agora, com a fila do kit e o que já saiu. Quem edita Configurações monta;
 * quem vê Kits e estoque acompanha a conta.
 */
export default async function KitPlanPage() {
  const actor = await requirePageActor("viewKits");
  const [plan, counts, config] = await Promise.all([getKitPlan(db), getKitCounts(db), getConfig()]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Consumação"
        title="Montagem e custo"
        description="O que vem em cada kit e quanto a consumação custa: com os inscritos de agora, com a fila do kit e com o que já saiu."
        actions={
          <Button asChild variant="outline">
            <Link href="/painel/kits">
              <ArrowLeft /> Kits e estoque
            </Link>
          </Button>
        }
      />
      <KitPlanStudio initialPlan={plan} counts={counts} canEdit={can(actor.access, "manageSettings")} eventName={config?.name ?? APP_NAME} />
    </div>
  );
}
