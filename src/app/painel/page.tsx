import type { Metadata } from "next";
import Link from "next/link";
import {
  Building,
  Check,
  ClipboardNote,
  Clock,
  Gift,
  List,
  Login,
  Package,
  QrCode,
  Sparkles,
  Teach,
  Trophy,
  UserPlus,
  Users,
  Warning,
} from "@/components/icons/pixel";
import { Led, PixelTag } from "@/components/retro/bits";
import { DeadlineTimer } from "@/components/retro/countdown";
import { LiveRefresh } from "@/components/retro/live-refresh";
import { Equalizer } from "@/components/staff/equalizer";
import { EmptyState, PageHeader, Panel, SegmentMeter, StatTile } from "@/components/staff/panel-ui";
import { StockCard, stockAlertText } from "@/components/staff/stock-card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatShortDateTime, formatTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { db } from "@/server/db";
import { getEventInfo, getRegistrationWindow } from "@/server/queries/config";
import { listVerificationQueue, recentCheckIns } from "@/server/queries/panel";
import { getCheckInTimeline, getDashboardStats } from "@/server/services/stats";
import { can } from "@/domain/rules";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Placar" };

export default async function DashboardPage() {
  const actor = await requirePageActor("viewPanel");
  const isAdmin = can(actor.role, "manageEmployees");
  const [event, window, stats, pending, signatures, checkIns, timeline] = await Promise.all([
    getEventInfo(),
    getRegistrationWindow(),
    getDashboardStats(db),
    listVerificationQueue({ kind: "PENDING", page: 1 }),
    listVerificationQueue({ kind: "AWAITING_SIGNATURE", page: 1 }),
    recentCheckIns(8),
    getCheckInTimeline(db, 6),
  ]);
  const stock = stats.stock;
  const employeePool = stock?.pools.find((pool) => pool.pool === "EMPLOYEE") ?? null;
  const presence = stats.expected > 0 ? Math.round((stats.present / stats.expected) * 100) : 0;
  const queue = [
    ...signatures.rows.map((row) => ({ ...row, kind: "AWAITING_SIGNATURE" as const })),
    ...pending.rows.map((row) => ({ ...row, kind: "PENDING" as const })),
  ].slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={event ? `${event.dateLongLabel} · ${event.timeLabel}` : undefined}
        title="Placar da festa"
        description={
          window.state === "OPEN"
            ? `Inscrições abertas até ${formatDateTime(window.closesAt)}.`
            : window.state === "NOT_OPEN"
              ? `Inscrições abrem em ${formatDateTime(window.opensAt)}.`
              : window.state === "CLOSED"
                ? "Inscrições públicas encerradas."
                : undefined
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/painel/inscricoes/nova">
                <UserPlus /> Cadastrar na hora
              </Link>
            </Button>
            <Button asChild>
              <Link href="/portaria">
                <QrCode /> Portaria
              </Link>
            </Button>
          </>
        }
      />

      {stock?.anyLow ? (
        <div className="flex items-start gap-3 rounded-xl border border-danger/50 bg-danger-soft p-4 text-sm font-semibold text-fg" role="alert">
          <Warning className="mt-0.5 size-5 shrink-0 animate-blink text-danger" />
          <p>
            Atenção ao estoque —{" "}
            {stock.pools
              .filter((p) => p.low)
              .map(stockAlertText)
              .join(" · ")}
          </p>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="relative overflow-clip rounded-2xl border border-red/40 bg-[linear-gradient(135deg,rgb(227_0_15/0.2),rgb(8_8_8/0.9)_55%)] p-5 shadow-[0_0_40px_-24px_var(--glow)]">
          <div className="halftone pointer-events-none absolute -top-10 -right-10 size-48 rounded-full opacity-30 [mask-image:radial-gradient(circle,#000_25%,transparent_70%)]" />
          <div className="relative flex items-center gap-2">
            <Led tone={stats.present > 0 ? "success" : "neutral"} blink={stats.present > 0} />
            <p className="pixel text-[0.55rem] text-fg-muted">Na pista agora</p>
            <LiveRefresh score={stats.present} className="ml-auto" />
          </div>
          <p className="relative mt-3 flex items-end gap-3">
            <span className="display text-7xl leading-none text-fg neon tabular" data-testid="stat-present">
              {stats.present}
            </span>
            <span className="display mb-1.5 text-2xl text-fg-muted tabular">/ {stats.expected}</span>
            <span className="pixel mb-2 ml-auto text-sm text-red tabular">{presence}%</span>
          </p>
          <SegmentMeter className="relative mt-4" value={stats.present} max={stats.expected} segments={24} label={`${stats.present} de ${stats.expected} presentes`} />
          <p className="relative mt-3 text-xs text-fg-muted">
            {stats.absent === 1 ? "1 esperado ainda não entrou" : `${plural(stats.absent, "esperado", "esperados")} ainda não entraram`} ·{" "}
            <Link href="/painel/participantes?filtro=absent" className="font-semibold text-red hover:underline">
              ver quem falta
            </Link>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Kits no estoque"
            value={stock?.totalAvailable ?? 0}
            icon={Gift}
            tone={stock?.anyLow ? "danger" : "brand"}
            href="/painel/kits"
            hint={employeePool ? `${(stock?.totalAvailable ?? 0) - employeePool.available} gerais · ${employeePool.available} funcionários` : undefined}
            testId="stat-kits-available"
          />
          <StatTile
            label="Kits entregues"
            value={stats.kitsDeliveredMember + stats.kitsDeliveredGuest + stats.kitsDeliveredEmployee}
            icon={Package}
            tone="success"
            hint={`${stats.kitsDeliveredMember} prof. · ${stats.kitsDeliveredGuest} conv.${stats.kitsDeliveredEmployee ? ` · ${stats.kitsDeliveredEmployee} func.` : ""}`}
            testId="stat-kits-delivered"
          />
          <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
            <div>
              <p className="text-[0.7rem] font-bold tracking-[0.1em] text-fg-muted uppercase">Entrega de kits</p>
              <p className="mt-1 text-sm text-fg">
                {event?.kitDeadline ? `Até ${event.kitDeadline.label}` : "Sem horário limite"}
              </p>
            </div>
            {event?.kitDeadline ? (
              <span className="flex items-center gap-2 rounded-md border border-line-strong bg-ink px-3 py-2">
                <Clock className="size-4 text-red" />
                <DeadlineTimer deadline={event.kitDeadline.at} />
              </span>
            ) : (
              <Link href="/painel/configuracoes" className="text-xs font-semibold text-red hover:underline">
                Definir horário
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Inscrições" value={stats.registrations} icon={List} href="/painel/inscricoes" testId="stat-registrations" />
        <StatTile label="Professoras e professores" value={stats.teachers} icon={Teach} href="/painel/participantes?filtro=teachers" testId="stat-teachers" hint={stats.otherMembers ? `+ ${plural(stats.otherMembers, "filiado", "filiados")} sem kit` : undefined} />
        <StatTile
          label="Convidados"
          value={stats.guests + stats.employeeGuests}
          icon={Users}
          hint={stats.employeeGuests ? `${stats.employeeGuests} de funcionários` : undefined}
          testId="stat-guests"
        />
        <StatTile label="Filiados confirmados" value={stats.confirmed} icon={Check} tone="success" testId="stat-confirmed" />
        <StatTile label="Aguardando conferência" value={stats.pending} icon={Clock} tone="warning" href="/painel/conferencia" testId="stat-pending" />
        <StatTile label="Fichas para assinar" value={stats.awaitingSignature} icon={ClipboardNote} tone="warning" href="/painel/conferencia?fila=assinatura" testId="stat-signature" />
        <StatTile label="Filiaram-se na festa" value={stats.joinedAtEvent} icon={Sparkles} href="/painel/filiacoes" testId="stat-joined" />
        <StatTile
          label="Kits a entregar"
          value={stats.kitsOwedMember + stats.kitsOwedGuest + stats.kitsOwedEmployee}
          icon={Gift}
          tone="neutral"
          hint={`${stats.kitsOwedMember} prof. · ${stats.kitsOwedGuest} conv.${stats.kitsOwedEmployee ? ` · ${stats.kitsOwedEmployee} func.` : ""} · saem na entrada`}
          testId="stat-kits-owed"
        />
        {stats.employees > 0 || isAdmin ? (
          <StatTile
            label="Funcionários"
            value={stats.employeesPresent}
            icon={Building}
            tone="warning"
            href={isAdmin ? "/painel/funcionarios" : undefined}
            hint={stats.employees ? `de ${plural(stats.employees, "liberado", "liberados")} já entraram` : "Libere os funcionários do SINDSERM"}
            testId="stat-employees-present"
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Entradas (últimas 6h)" icon={Login}>
          <Equalizer buckets={timeline} />
        </Panel>
        <Panel
          title="Estoque de kits"
          icon={Gift}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/painel/kits">Detalhes</Link>
            </Button>
          }
        >
          {stock ? <StockCard stock={stock} demand={stats.kitDemand} /> : null}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel
          title="Fila da conferência"
          icon={Check}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/painel/conferencia">Ver fila</Link>
            </Button>
          }
        >
          {queue.length === 0 ? (
            <EmptyState icon={Check} title="Fila zerada">
              Inscrições para conferir e fichas para assinar aparecem aqui.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {queue.map((row) => (
                <li key={row.registrationId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/painel/participantes/${row.personId}`} className="block truncate font-semibold text-fg hover:text-red">
                      {row.fullName}
                    </Link>
                    <p className="truncate text-xs text-fg-muted">
                      {row.isTeacher ? "Professor(a)" : "Não professor(a)"} · Matrícula {row.registrationNumber ?? "—"} ·{" "}
                      {formatShortDateTime(row.createdAt)}
                    </p>
                  </div>
                  {row.kind === "AWAITING_SIGNATURE" ? <PixelTag tone="warning">Assinar</PixelTag> : <PixelTag tone="neutral">Conferir</PixelTag>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Últimas entradas" icon={Trophy}>
          {checkIns.length === 0 ? (
            <EmptyState icon={Login} title="Pista vazia">
              As entradas aparecem aqui assim que a portaria começar.
            </EmptyState>
          ) : (
            <ol className="space-y-1.5">
              {checkIns.map((entry, index) => (
                <li
                  key={`${entry.personId}-${entry.checkedInAt.getTime()}`}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-white/[0.03]"
                >
                  <span className="pixel w-6 text-[0.55rem] text-red tabular">{String(index + 1).padStart(2, "0")}</span>
                  <Link href={`/painel/participantes/${entry.personId}`} className="min-w-0 flex-1 truncate font-semibold text-fg hover:text-red">
                    {entry.fullName}
                  </Link>
                  <span className="shrink-0 text-xs text-fg-muted tabular">
                    {entry.role === "EMPLOYEE" ? "Func. · " : entry.role === "GUEST" ? "P2 · " : "P1 · "}
                    {formatTime(entry.checkedInAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
