import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand";
import { Chart } from "@/components/icons/pixel";
import { RetroBackdrop } from "@/components/retro/retro-backdrop";
import { UserMenu } from "@/components/staff/user-menu";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/rules";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { APP_NAME, getConfig } from "@/server/queries/config";
import { countCheckInsBy } from "@/server/services/stats";
import { requirePageActor } from "@/server/session";

export default async function GateLayout({ children }: LayoutProps<"/portaria">) {
  const actor = await requirePageActor("viewGate");
  const [config, score] = await Promise.all([getConfig(), countCheckInsBy(db, actor.userId)]);
  const showPanel = can(actor.access, "viewPanel");
  return (
    <div className="relative min-h-dvh print:min-h-0">
      <RetroBackdrop variant="calm" />
      <header className="no-print sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4">
          <Link href="/portaria" className="min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-red">
            {/* Com o botão "Painel" no celular, fica só o ícone: o nome da festa não caberia. */}
            <BrandLockup
              name={config?.name ?? APP_NAME}
              kicker="Portaria"
              className={cn(showPanel && "[&>span:last-child]:hidden min-[480px]:[&>span:last-child]:block")}
            />
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            {showPanel ? (
              <Button asChild variant="outline" size="sm" className="h-9 px-2.5" data-testid="back-to-panel">
                <Link href="/painel" aria-label="Voltar ao painel">
                  <Chart /> Painel
                </Link>
              </Button>
            ) : null}
            <span className="hidden flex-col items-end leading-none min-[380px]:flex" title="Entradas registradas por você">
              <span className="pixel text-[0.45rem] text-fg-dim">Seu placar</span>
              <span className="pixel mt-1 text-[0.7rem] text-red tabular" data-testid="operator-score">
                {String(score).padStart(4, "0")}
              </span>
            </span>
            <UserMenu name={actor.name} role={actor.role} showPanel={showPanel} compact />
          </div>
        </div>
        <div className="neon-line h-px opacity-60" aria-hidden />
      </header>
      <main className="relative z-10 mx-auto max-w-2xl px-4 pt-5 pb-16 print:p-0">{children}</main>
    </div>
  );
}
