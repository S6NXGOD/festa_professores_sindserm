import type { Metadata } from "next";
import Link from "next/link";
import { CountUp } from "@/components/count-up";
import { GateSearch } from "@/components/gate/gate-search";
import { AlarmClock, Clock, Login, QrCode, Search, Users } from "@/components/icons/pixel";
import { Panel } from "@/components/retro/bits";
import { DeadlineTimer } from "@/components/retro/countdown";
import { LiveRefresh } from "@/components/retro/live-refresh";
import { SegmentMeter } from "@/components/staff/panel-ui";
import { can } from "@/domain/rules";
import { db } from "@/server/db";
import { getEventInfo } from "@/server/queries/config";
import { getDashboardStats } from "@/server/services/stats";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Portaria" };

export default async function GateHomePage() {
  // O layout também verifica, mas páginas podem renderizar em paralelo ao layout.
  const actor = await requirePageActor("viewGate");
  const [stats, event] = await Promise.all([getDashboardStats(db), getEventInfo()]);
  const notStarted = event ? !event.started : false;
  return (
    <div className="space-y-5">
      {notStarted && event?.startsAt ? (
        <div className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning-soft p-4" data-testid="gate-not-started">
          <AlarmClock className="size-7 shrink-0 animate-wiggle text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-fg">A festa começa {event.startLabel}</p>
            <p className="text-xs text-fg-muted">Entradas antes disso pedem uma confirmação a mais (e ficam anotadas).</p>
          </div>
          <DeadlineTimer deadline={event.startsAt} className="shrink-0 text-xs" />
        </div>
      ) : null}
      <Link
        href="/portaria/scanner"
        className="arcade group relative flex h-44 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-brand text-white outline-none focus-visible:ring-4 focus-visible:ring-red/60"
        data-testid="open-scanner"
      >
        <span className="halftone-white absolute -top-10 -right-10 size-44 rounded-full opacity-40" aria-hidden />
        <span className="scanlines absolute inset-0 opacity-40" aria-hidden />
        <span className="relative inline-flex size-16 items-center justify-center rounded-xl bg-black/20">
          <span className="absolute inset-0 animate-pulse-ring rounded-xl bg-white/30" aria-hidden />
          <QrCode className="relative size-10" />
        </span>
        <span className="display relative text-4xl sm:text-5xl">Ler QR Code</span>
        <span className="pixel relative text-[0.5rem] opacity-80">
          Aponte e confirme<span className="animate-blink">_</span>
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[0.7rem] font-bold tracking-[0.1em] text-fg-muted uppercase">
                <Login className="size-4 text-success-text" /> Na pista
                <LiveRefresh className="ml-1" />
              </p>
              <p className="display mt-1 text-5xl leading-none text-fg tabular">
                <CountUp value={stats.present} />
                <span className="ml-2 text-2xl text-fg-dim">/ {stats.expected}</span>
              </p>
            </div>
            <Users className="size-8 text-fg-dim" />
          </div>
          <SegmentMeter className="mt-3" value={stats.present} max={stats.expected} label={`${stats.present} de ${stats.expected} presentes`} />
        </div>
        {event?.kitDeadline && can(actor.access, "deliverKits") ? (
          <div className="col-span-2 flex items-center justify-between rounded-xl border border-line bg-surface p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Clock className="size-5 text-red" /> Kits até {event.kitDeadline.label}
            </p>
            <DeadlineTimer deadline={event.kitDeadline.at} className="text-xs" />
          </div>
        ) : null}
      </div>

      <Panel title="Localizar pessoa" icon={Search}>
        <GateSearch requireFullCpf={!can(actor.access, "viewFullCpf")} />
      </Panel>
    </div>
  );
}
