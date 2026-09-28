import { redirect } from "next/navigation";
import { RetroBackdrop } from "@/components/retro/retro-backdrop";
import { PanelMobileNav, PanelSidebar } from "@/components/staff/panel-nav";
import { QuickSearch } from "@/components/staff/quick-search";
import { RegistrationRadar } from "@/components/staff/registration-radar";
import { Tutorial } from "@/components/tutorial/tutorial";
import { UserMenu } from "@/components/staff/user-menu";
import { can } from "@/domain/access";
import { tutorialSteps } from "@/domain/tutorial";
import { initials } from "@/lib/text";
import { APP_NAME, getConfig } from "@/server/queries/config";
import { queueCounts } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";
import { appVersionLabel } from "@/server/version";

export default async function PanelLayout({ children }: LayoutProps<"/painel">) {
  const actor = await requirePageActor("viewPanel");
  const [config, badges] = await Promise.all([getConfig(), queueCounts()]);
  if (!config && can(actor.access, "manageSettings")) redirect("/setup/evento");
  const eventName = config?.name ?? APP_NAME;

  return (
    <div className="relative flex min-h-dvh print:block print:min-h-0">
      <RetroBackdrop variant="calm" />
      <PanelSidebar access={actor.access} badges={badges} eventName={eventName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-ink/88 backdrop-blur">
          <div className="flex h-16 items-center gap-2 px-3 sm:px-6">
            <PanelMobileNav access={actor.access} badges={badges} eventName={eventName} />
            {can(actor.access, "search") ? (
              <QuickSearch personPath={can(actor.access, "viewPeople") ? "/painel/participantes" : "/portaria/pessoa"} />
            ) : (
              <div className="flex-1" />
            )}
            <div className="ml-auto">
              <UserMenu name={actor.name} role={actor.role} showGate={can(actor.access, "viewGate")} version={appVersionLabel()} />
            </div>
          </div>
          <div className="neon-line h-px opacity-60" aria-hidden />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-6 print:max-w-none print:p-0">{children}</main>
      </div>
      {/* Inscrição nova (de qualquer lugar): level up, aviso com o nome e números atualizados. */}
      {can(actor.access, "viewRegistrations") ? (
        <RegistrationRadar since={new Date().toISOString()} canOpenPeople={can(actor.access, "viewPeople")} />
      ) : null}
      <Tutorial steps={tutorialSteps(actor.access, actor.name)} autoOpen={!actor.tutorialSeen} initials={initials(actor.name)} />
      {!actor.tutorialSeen ? <span hidden data-testid="tutorial-pending" /> : null}
    </div>
  );
}
