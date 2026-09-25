import { redirect } from "next/navigation";
import { RetroBackdrop } from "@/components/retro/retro-backdrop";
import { PanelMobileNav, PanelSidebar } from "@/components/staff/panel-nav";
import { QuickSearch } from "@/components/staff/quick-search";
import { UserMenu } from "@/components/staff/user-menu";
import { APP_NAME, getConfig } from "@/server/queries/config";
import { queueCounts } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export default async function PanelLayout({ children }: LayoutProps<"/painel">) {
  const actor = await requirePageActor("viewPanel");
  const [config, counts] = await Promise.all([getConfig(), queueCounts()]);
  if (!config && actor.role === "ADMIN") redirect("/setup/evento");
  const eventName = config?.name ?? APP_NAME;
  const queue = counts.pending + counts.awaitingSignature;

  return (
    <div className="relative flex min-h-dvh print:block print:min-h-0">
      <RetroBackdrop variant="calm" />
      <PanelSidebar role={actor.role} queue={queue} eventName={eventName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-ink/88 backdrop-blur">
          <div className="flex h-16 items-center gap-2 px-3 sm:px-6">
            <PanelMobileNav role={actor.role} queue={queue} eventName={eventName} />
            <QuickSearch />
            <div className="ml-auto">
              <UserMenu name={actor.name} role={actor.role} showGate />
            </div>
          </div>
          <div className="neon-line h-px opacity-60" aria-hidden />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
