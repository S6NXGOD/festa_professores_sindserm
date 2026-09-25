import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/brand/brand";
import { RetroBackdrop } from "@/components/retro/retro-backdrop";
import { SetupWizard } from "@/components/settings/setup-wizard";
import { APP_TIME_ZONE } from "@/lib/datetime";
import { getConfig } from "@/server/queries/config";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Configurar a festa" };

export default async function SetupEventPage() {
  await requirePageActor("manageSettings");
  const config = await getConfig();
  if (config) redirect("/painel/configuracoes");
  return (
    <main className="relative min-h-dvh overflow-x-clip px-4 py-8 sm:py-12">
      <RetroBackdrop variant="calm" />
      <div className="relative z-10 mx-auto mb-8 max-w-3xl">
        <BrandLockup name="Configuração da festa" kicker="Player 1 start" />
        <p className="mt-3 text-sm text-fg-muted">O formulário público só é liberado depois de concluir esta etapa.</p>
      </div>
      <div className="relative z-10">
        <SetupWizard timeZone={APP_TIME_ZONE} />
      </div>
    </main>
  );
}
