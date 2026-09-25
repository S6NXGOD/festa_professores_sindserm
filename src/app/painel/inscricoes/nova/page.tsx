import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardNote } from "@/components/icons/pixel";
import { MemberWizard } from "@/components/registration/member-wizard";
import { PageHeader } from "@/components/staff/panel-ui";
import { Button } from "@/components/ui/button";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Cadastro na hora" };

export default async function StaffRegistrationPage() {
  await requirePageActor("registerAtEvent");
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
      <MemberWizard mode="staff" />
    </div>
  );
}
