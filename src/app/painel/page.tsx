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
import { ShareDialog } from "@/components/staff/share-dialog";
import { StockCard, stockAlertText } from "@/components/staff/stock-card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatShortDateTime, formatTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { getConfig, getEventInfo, getRegistrationWindow } from "@/server/queries/config";
import { defaultShareMessage, shareSummary } from "@/server/queries/share";
import { publicBaseUrl } from "@/server/public-url";
import { listAffiliationForms, listVerificationQueue, recentCheckIns } from "@/server/queries/panel";
import { getCheckInTimeline, getDashboardStats } from "@/server/services/stats";
import { can } from "@/domain/rules";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Placar" };

export default async function DashboardPage() {
  const actor = await requirePageActor("viewDashboard");
  const isAdmin = can(actor.access, "manageEmployees");
  // Atalhos só para o que a pessoa pode abrir (sem cair numa tela bloqueada).
  const canRegistrations = can(actor.access, "viewRegistrations");
  const canPeople = can(actor.access, "viewPeople");
  const canForms = can(actor.access, "viewForms");
  const canKits = can(actor.access, "viewKits");
  const canEmployees = can(actor.access, "viewEmployees");
  const [config, event, window, stats, pending, drafts, checkIns, timeline] = await Promise.all([
    getConfig(),
    getEventInfo(),
    getRegistrationWindow(),
    getDashboardStats(db),
    listVerificationQueue({ kind: "PENDING", page: 1 }),
    listAffiliationForms({ status: "DRAFT", page: 1 }),
    recentCheckIns(8),
    getCheckInTimeline(db, 6),
  ]);
  const stock = stats.stock;
  const shareUrl = `${publicBaseUrl() ?? ""}/`;
  const employeePool = stock?.pools.find((pool) => pool.pool === "EMPLOYEE") ?? null;
  const presence = stats.expected > 0 ? Math.round((stats.present / stats.expected) * 100) : 0;
  // Antes da festa (e enquanto ninguém entrou), "quem falta" não faz sentido: o placar mostra
  // quantos já estão prontos para entrar e o que ainda depende do Atendimento.
  const preEvent = Boolean(event && !event.started && stats.present === 0);
  const readiness = stats.expected > 0 ? Math.round((stats.ready / stats.expected) * 100) : 0;
  const notReady = Math.max(0, stats.expected - stats.ready);
  const toResolve = [
    stats.pending > 0 ? plural(stats.pending, "inscrição para conferir", "inscrições para conferir") : null,
    stats.awaitingSignature > 0 ? plural(stats.awaitingSignature, "ficha para assinar", "fichas para assinar") : null,
  ].filter(Boolean);
  const resolveHref = stats.pending > 0 ? "/painel/inscricoes?filtro=conferir" : "/painel/filiacoes?filtro=assinar";
  const canSettings = can(actor.access, "manageSettings");
  // As duas filas do Atendimento, na ordem em que a recepção costuma resolver.
  const queue = [
    ...drafts.rows.map((row) => ({
      key: `ficha-${row.id}`,
      href: canForms ? `/painel/filiacoes/${row.id}` : null,
      queueHref: "/painel/filiacoes?filtro=assinar",
      fullName: row.fullName,
      isTeacher: row.isTeacher,
      registrationNumber: row.registrationNumber,
      createdAt: row.createdAt,
      kind: "SIGNATURE" as const,
    })),
    ...pending.rows.map((row) => ({
      key: `inscricao-${row.registrationId}`,
      href: canPeople ? `/painel/participantes/${row.personId}` : null,
      queueHref: "/painel/inscricoes?filtro=conferir",
      fullName: row.fullName,
      isTeacher: row.isTeacher,
      registrationNumber: row.registrationNumber,
      createdAt: row.createdAt,
      kind: "PENDING" as const,
    })),
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
                ? `Inscrições pelo site encerradas em ${formatDateTime(window.closesAt)}. O Atendimento continua cadastrando na hora.`
                : undefined
        }
        actions={
          <>
            {event ? (
              <ShareDialog
                url={shareUrl}
                autoMessage={defaultShareMessage(event, window, shareUrl)}
                savedMessage={config?.shareMessage ?? null}
                canEdit={can(actor.access, "manageSettings")}
                title={event.name}
                summary={shareSummary(event, window)}
              />
            ) : null}
            {can(actor.access, "registerAtEvent") ? (
              <Button asChild variant="outline">
                <Link href="/painel/inscricoes/nova">
                  <UserPlus /> Cadastrar na hora
                </Link>
              </Button>
            ) : null}
            {can(actor.access, "viewGate") ? (
              <Button asChild>
                <Link href="/portaria">
                  <QrCode /> Portaria
                </Link>
              </Button>
            ) : null}
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
        {preEvent && event?.startsAt ? (
          <div
            className="relative overflow-clip rounded-2xl border border-red/40 bg-[linear-gradient(135deg,rgb(227_0_15/0.2),rgb(8_8_8/0.9)_55%)] p-5 shadow-[0_0_40px_-24px_var(--glow)]"
            data-testid="pre-event-hero"
          >
            <div className="halftone pointer-events-none absolute -top-10 -right-10 size-48 rounded-full opacity-30 [mask-image:radial-gradient(circle,#000_25%,transparent_70%)]" />
            <div className="relative flex flex-wrap items-center gap-2">
              <Led tone="neutral" />
              <p className="pixel text-[0.55rem] text-fg-muted">Antes da festa</p>
              <span
                className="ml-auto flex items-center gap-2 rounded-md border border-line-strong bg-ink/70 px-2.5 py-1.5"
                title={`A festa começa em ${event.startLabel}`}
              >
                <Clock className="size-4 text-red" />
                <span className="pixel text-[0.5rem] text-fg-muted">Começa em</span>
                <DeadlineTimer deadline={event.startsAt} />
              </span>
              {/* No celular o selo não cabe na linha; a atualização automática continua. */}
              <LiveRefresh score={stats.present} className="hidden sm:inline-flex" />
            </div>
            <p className="relative mt-3 flex items-end gap-3">
              <span className="display text-7xl leading-none text-fg neon tabular" data-testid="stat-ready">
                {stats.ready}
              </span>
              <span className="display mb-1.5 text-2xl text-fg-muted tabular">/ {stats.expected}</span>
              <span className="pixel mb-2 ml-auto text-sm text-red tabular">{readiness}%</span>
            </p>
            <p className="relative mt-1 text-sm font-semibold text-fg">prontos para entrar</p>
            <SegmentMeter
              className="relative mt-3"
              value={stats.ready}
              max={stats.expected}
              segments={24}
              label={`${stats.ready} de ${stats.expected} prontos para entrar`}
            />
            <p className="relative mt-3 text-xs text-fg-muted" data-testid="pre-event-note">
              {notReady > 0 ? (
                <>
                  {plural(notReady, "pessoa ainda não pode entrar", "pessoas ainda não podem entrar")}
                  {toResolve.length ? `: ${toResolve.join(" e ")} (com os convidados). ` : ". "}
                  {canRegistrations || canForms ? (
                    <Link href={resolveHref} className="font-semibold text-red hover:underline">
                      Resolver antes da festa
                    </Link>
                  ) : null}
                </>
              ) : stats.expected > 0 ? (
                "Todo mundo já está liberado: agora é só a pista abrir."
              ) : (
                "Ainda sem inscritos."
              )}
            </p>
          </div>
        ) : (
          <div className="relative overflow-clip rounded-2xl border border-red/40 bg-[linear-gradient(135deg,rgb(227_0_15/0.2),rgb(8_8_8/0.9)_55%)] p-5 shadow-[0_0_40px_-24px_var(--glow)]">
            <div className="halftone pointer-events-none absolute -top-10 -right-10 size-48 rounded-full opacity-30 [mask-image:radial-gradient(circle,#000_25%,transparent_70%)]" />
            <div className="relative flex items-center gap-2">
              <Led tone={stats.present > 0 ? "success" : "neutral"} blink={stats.present > 0} />
              <p className="pixel text-[0.55rem] text-fg-muted">{event && !event.started ? "Na pista (antes do horário)" : "Na pista agora"}</p>
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
              {canRegistrations ? (
                <Link href="/painel/inscricoes?filtro=ausentes" className="font-semibold text-red hover:underline">
                  ver quem falta
                </Link>
              ) : null}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Kits no estoque"
            value={stock?.totalAvailable ?? 0}
            icon={Gift}
            tone={stock?.anyLow ? "danger" : "brand"}
            href={canKits ? "/painel/kits" : undefined}
            hint={employeePool ? `${(stock?.totalAvailable ?? 0) - employeePool.available} gerais · ${employeePool.available} colaboradores` : undefined}
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
          <div
            className={cn(
              "col-span-2 flex items-center justify-between gap-3 rounded-xl border bg-surface p-4",
              event?.kitDeadline?.passed ? "border-danger/50" : "border-line",
            )}
            data-testid="kit-deadline-card"
          >
            <div className="min-w-0">
              <p className="text-[0.7rem] font-bold tracking-[0.1em] text-fg-muted uppercase">Entrega de kits</p>
              <p className="mt-1 text-sm text-fg">
                {event?.kitDeadline
                  ? event.kitDeadline.passed
                    ? `Encerrada às ${event.kitDeadline.label}`
                    : `Até ${event.kitDeadline.label}`
                  : "Sem horário limite"}
              </p>
              {event?.kitDeadline?.passed ? (
                <p className="mt-0.5 text-xs text-fg-muted">
                  Quem entra agora fica sem kit.{canSettings ? " Mudando o horário, os kits voltam a sair na hora." : ""}
                </p>
              ) : null}
            </div>
            {event?.kitDeadline && !(event.kitDeadline.passed && canSettings) ? (
              <span className="flex shrink-0 items-center gap-2 rounded-md border border-line-strong bg-ink px-3 py-2">
                <Clock className="size-4 text-red" />
                <DeadlineTimer deadline={event.kitDeadline.at} />
              </span>
            ) : canSettings ? (
              <Link href="/painel/configuracoes#kit-deadline" className="shrink-0 text-xs font-semibold text-red hover:underline">
                {event?.kitDeadline ? "Mudar horário" : "Definir horário"}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Inscrições" value={stats.registrations} icon={List} href={canRegistrations ? "/painel/inscricoes?filtro=todas" : undefined} testId="stat-registrations" />
        <StatTile label="Professoras e professores" value={stats.teachers} icon={Teach} href={canRegistrations ? "/painel/inscricoes?filtro=todas" : undefined} testId="stat-teachers" hint={stats.otherMembers ? `+ ${plural(stats.otherMembers, "filiado", "filiados")} sem kit` : undefined} />
        <StatTile
          label="Convidados"
          value={stats.guests + stats.employeeGuests}
          icon={Users}
          hint={stats.employeeGuests ? `${stats.employeeGuests} de colaboradores` : undefined}
          testId="stat-guests"
        />
        <StatTile label="Filiados confirmados" value={stats.confirmed} icon={Check} tone="success" testId="stat-confirmed" />
        <StatTile label="Aguardando conferência" value={stats.pending} icon={Clock} tone="warning" href={canRegistrations ? "/painel/inscricoes?filtro=conferir" : undefined} testId="stat-pending" />
        <StatTile label="Fichas para assinar" value={stats.draftForms} icon={ClipboardNote} tone="warning" href={canForms ? "/painel/filiacoes?filtro=assinar" : undefined} testId="stat-signature" />
        <StatTile label="Filiaram-se na festa" value={stats.joinedAtEvent} icon={Sparkles} href={canForms ? "/painel/filiacoes?filtro=FORMALIZED" : undefined} testId="stat-joined" />
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
            label="Colaboradores"
            value={stats.employeesPresent}
            icon={Building}
            tone="warning"
            href={canEmployees ? "/painel/colaboradores" : undefined}
            hint={stats.employees ? `de ${plural(stats.employees, "liberado", "liberados")} já entraram` : "Libere os colaboradores do SINDSERM"}
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
            canKits ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/painel/kits">Detalhes</Link>
              </Button>
            ) : null
          }
        >
          {stock ? <StockCard stock={stock} demand={stats.kitDemand} /> : null}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel
          title="Para resolver"
          icon={Check}
          action={
            <div className="flex gap-1">
              {stats.pending > 0 && canRegistrations ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/painel/inscricoes?filtro=conferir">Conferir</Link>
                </Button>
              ) : null}
              {stats.draftForms > 0 && canForms ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/painel/filiacoes?filtro=assinar">Assinar</Link>
                </Button>
              ) : null}
            </div>
          }
        >
          {queue.length === 0 ? (
            <EmptyState icon={Check} title="Fila zerada">
              Inscrições para conferir e fichas para assinar aparecem aqui.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {queue.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    {row.href ? (
                      <Link href={row.href} className="block truncate font-semibold text-fg hover:text-red">
                        {row.fullName}
                      </Link>
                    ) : (
                      <p className="truncate font-semibold text-fg">{row.fullName}</p>
                    )}
                    <p className="truncate text-xs text-fg-muted">
                      {row.isTeacher ? "Professor(a)" : "Não professor(a)"} · Matrícula {row.registrationNumber || "—"} ·{" "}
                      {formatShortDateTime(row.createdAt)}
                    </p>
                  </div>
                  {(row.kind === "SIGNATURE" ? canForms : canRegistrations) ? (
                    <Link href={row.queueHref} className="shrink-0">
                      {row.kind === "SIGNATURE" ? <PixelTag tone="warning">Assinar</PixelTag> : <PixelTag tone="neutral">Conferir</PixelTag>}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Últimas entradas"
          icon={Trophy}
          action={
            can(actor.access, "viewEntries") ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/painel/entradas" data-testid="dashboard-all-entries">
                  Ver todas
                </Link>
              </Button>
            ) : null
          }
        >
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
                  {canPeople ? (
                    <Link href={`/painel/participantes/${entry.personId}`} className="min-w-0 flex-1 truncate font-semibold text-fg hover:text-red">
                      {entry.fullName}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-semibold text-fg">{entry.fullName}</span>
                  )}
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
