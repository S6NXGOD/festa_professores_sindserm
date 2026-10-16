import Link from "next/link";
import { SessionKeeper } from "@/components/auth/session-keeper";
import { BrandLockup } from "@/components/brand/brand";
import { Chart } from "@/components/icons/pixel";
import { RetroBackdrop } from "@/components/retro/retro-backdrop";
import { UserMenu } from "@/components/staff/user-menu";
import { Tutorial } from "@/components/tutorial/tutorial";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/rules";
import { tutorialSteps } from "@/domain/tutorial";
import { initials } from "@/lib/text";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { APP_NAME, getConfig } from "@/server/queries/config";
import { countKitsDeliveredBy } from "@/server/services/desk";
import { countCheckInsBy } from "@/server/services/stats";
import { requirePageActor } from "@/server/session";
import { appVersionLabel } from "@/server/version";

export default async function GateLayout({ children }: LayoutProps<"/portaria">) {
  const actor = await requirePageActor("viewGate");
  // Mesa dos kits (entrega kits e não registra entradas): o placar é de kits entregues.
  const deskOnly = can(actor.access, "deliverKits") && !can(actor.access, "checkIn");
  const [config, score] = await Promise.all([getConfig(), deskOnly ? countKitsDeliveredBy(db, actor.userId) : countCheckInsBy(db, actor.userId)]);
  const showPanel = can(actor.access, "viewPanel");
  // Treino obrigatório pendente: o tutorial não abre por cima dele.
  const trainingFirst = actor.gateTrainingPending || (deskOnly && actor.deskTrainingPending);
  return (
    <div className="relative min-h-dvh print:min-h-0">
      <RetroBackdrop variant="calm" />
      <header className="no-print sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4">
          <Link href={deskOnly ? "/portaria/mesa" : "/portaria"} className="min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-red">
            {/* Com o botão "Painel" no celular, fica só o ícone: o nome da festa não caberia. */}
            <BrandLockup
              name={config?.name ?? APP_NAME}
              kicker={deskOnly ? "Mesa dos kits" : "Portaria"}
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
            <span className="hidden flex-col items-end leading-none min-[380px]:flex" title={deskOnly ? "Kits entregues por você" : "Entradas registradas por você"}>
              <span className="pixel text-[0.45rem] text-fg-dim">{deskOnly ? "Seus kits" : "Seu placar"}</span>
              <span className="pixel mt-1 text-[0.7rem] text-red tabular" data-testid="operator-score">
                {String(score).padStart(4, "0")}
              </span>
            </span>
            <UserMenu name={actor.name} role={actor.role} showPanel={showPanel} showTraining={can(actor.access, "checkIn")} compact version={appVersionLabel()} />
          </div>
        </div>
        <div className="neon-line h-px opacity-60" aria-hidden />
      </header>
      {/* Sem z-index aqui: com ele, o leitor de QR (tela cheia, "fixed") ficava preso embaixo deste cabeçalho,
          escondendo o "Voltar", a lanterna e a troca de câmera. O cenário já fica atrás (-z-10). */}
      <main className="relative mx-auto max-w-2xl px-4 pt-5 pb-16 print:p-0">{children}</main>
      <Tutorial
        steps={tutorialSteps(actor.access, actor.name)}
        autoOpen={!actor.tutorialSeen && !trainingFirst}
        initials={initials(actor.name)}
      />
      {!actor.tutorialSeen && !trainingFirst ? <span hidden data-testid="tutorial-pending" /> : null}
      <SessionKeeper />
    </div>
  );
}
