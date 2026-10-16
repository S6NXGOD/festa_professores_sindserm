import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardNote } from "@/components/icons/pixel";
import { MemberWizard } from "@/components/registration/member-wizard";
import { PageHeader } from "@/components/staff/panel-ui";
import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { WalkInKitNotice } from "@/components/registration/walk-in-kit-notice";
import { getStaffKitSupply } from "@/server/services/kit-waitlist";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Cadastro na hora" };

export default async function StaffRegistrationPage() {
  await requirePageActor("registerAtEvent");
  const kitSupply = await getStaffKitSupply(db);
  return (
    <div>
      <PageHeader
        eyebrow="Atendimento"
        title="Cadastro na hora"
        description="Para quem já é filiado(a). A filiação começa como aguardando conferência."
        actions={
          <Button asChild variant="outline">
            <Link href="/painel/filiacoes/nova">
              <ClipboardNote /> Não é filiado? Ficha de filiação
            </Link>
          </Button>
        }
      />
      {kitSupply?.extra ? <WalkInKitNotice free={kitSupply.extra.free} /> : null}
      <MemberWizard mode="staff" kitSupply={kitSupply} />
    </div>
  );
}
