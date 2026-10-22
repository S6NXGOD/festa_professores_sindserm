import type { Metadata } from "next";
import Link from "next/link";
import {
  Building,
  Check,
  ClipboardNote,
  Clock,
  Gift,
  Heart,
  List,
  Login,
  Package,
  QrCode,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  Warning,
} from "@/components/icons/pixel";
import { PersonIcon } from "@/components/icons/person-icon";
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
import { stockBalance } from "@/domain/kit-comparison";
import type { StockMode, StockPool } from "@/domain/types";
import { can } from "@/domain/rules";
import { requirePageActor } from "@/server/session";
import { GAME, T } from "@/domain/edition";

export const metadata: Metadata = { title: "Placar" };

/** "no estoque geral", "no dos colaboradores": onde falta ou sobra kit. */
function poolPlace(pool: StockPool, mode: StockMode) {
  if (pool === "ALL") return mode === "UNIFIED" ? "no estoque único" : "no estoque geral";
  if (pool === "MEMBER") return `no estoque de ${T.person}`;
  if (pool === "GUEST") return "no estoque de convidado";
  return "no estoque dos colaboradores";
}

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
  // O placar é das inscrições (filiados e os convidados deles). Colaboradores e cortesias são
  // listas da organização: aparecem à parte, sem inflar o "prontos para entrar" (decisão da organização).
  const presence = stats.registrationsExpected > 0 ? Math.round((stats.registrationsPresent / stats.registrationsExpected) * 100) : 0;
  // Antes da festa (e enquanto ninguém entrou), "quem falta" não faz sentido: o placar mostra
  // quantos já estão prontos para entrar e o que ainda depende do Atendimento.
  const preEvent = Boolean(event && !event.started && stats.present === 0);
  const readiness = stats.registrationsExpected > 0 ? Math.round((stats.registrationsReady / stats.registrationsExpected) * 100) : 0;
  const notReady = Math.max(0, stats.registrationsExpected - stats.registrationsReady);
  const registrationsAbsent = Math.max(0, stats.registrationsExpected - stats.registrationsPresent);
  const toResolve = [
    stats.pending > 0 ? plural(stats.pending, "inscrição para conferir", "inscrições para conferir") : null,
    stats.awaitingSignature > 0 ? plural(stats.awaitingSignature, "ficha para assinar", "fichas para assinar") : null,
  ].filter(Boolean);
  const resolveHref = stats.pending > 0 ? "/painel/inscricoes?filtro=conferir" : "/painel/filiacoes?filtro=assinar";
  // Colaboradores e cortesias são um cadastro só (employee): aqui cada um aparece separado.
  const employeesOnly = stats.employees - stats.courtesies;
  const employeesOnlyPresent = stats.employeesPresent - stats.courtesiesPresent;
  const courtesiesWithoutKit = stats.courtesies - stats.courtesiesWithKit;
  // Kits dos colaboradores (e dos convidados deles), sem as cortesias, que saem do mesmo estoque.
  const employeeKitsDelivered = stats.kitsDeliveredEmployee - stats.kitsDeliveredCourtesy;
  const employeeKitsOwed = Math.max(0, stats.kitsOwedEmployee - stats.kitsOwedCourtesy);
  const kitParts = (member: number, guest: number, employee: number, courtesy: number) =>
    [`${member} ${T.short}`, `${guest} conv.`, employee ? `${employee} colab.` : null, courtesy ? `${courtesy} cort.` : null].filter(Boolean).join(" · ");
  // Quem conta no placar: as inscrições. A organização vem numa linha própria.
  const registrationBreakdown = [plural(stats.teachers + stats.otherMembers, "inscrito", "inscritos"), plural(stats.guests, "convidado", "convidados")].join(" · ");
  const organizationBreakdown = [
    employeesOnly ? plural(employeesOnly, "colaborador", "colaboradores") : null,
    stats.courtesies ? plural(stats.courtesies, "cortesia", "cortesias") : null,
    stats.employeeGuests ? plural(stats.employeeGuests, "convidado de colaborador", "convidados de colaboradores") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const canSettings = can(actor.access, "manageSettings");
  // A conta dos kits (cadastrados − previstos): falta antes da festa vira aviso aqui, com o atalho para a conta.
  const balances = stock ? stockBalance(stock.pools.map((pool) => ({ pool: pool.pool, total: pool.total })), stats.kitDemand, stock.mode) : [];
  const shortPools = balances.filter((balance) => balance.balance < 0);
  const plannedKits = stats.kitDemand.member + stats.kitDemand.guest + stats.kitDemand.employee;
  const stockTotal = balances.reduce((sum, balance) => sum + balance.total, 0);
  const unifyHelps = stock?.mode !== "UNIFIED" && shortPools.length > 0 && stockTotal >= plannedKits;
  const kitQueue = stats.kitWaitlist.member + stats.kitWaitlist.guest;
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

      {shortPools.length > 0 && stock ? (
        <div
          className="flex flex-col gap-3 rounded-xl border border-warning/55 bg-warning-soft p-4 text-sm text-fg sm:flex-row sm:items-start"
          data-testid="dashboard-kit-shortage"
        >
          <p className="flex min-w-0 flex-1 items-start gap-3">
            <Warning className="mt-0.5 size-5 shrink-0 text-warning" />
            <span className="min-w-0">
            <strong>
              Faltam{" "}
              {shortPools.map((balance) => `${(-balance.balance).toLocaleString("pt-BR")} kits ${poolPlace(balance.pool, stock.mode)}`).join(" e ")}
            </strong>{" "}
            para os kits previstos.{" "}
            {unifyHelps
              ? `Somando os estoques, sobram ${(stockTotal - plannedKits).toLocaleString("pt-BR")}: juntando, todo mundo tem kit.`
              : "Quem se inscrever agora entra na fila do kit."}
            </span>
          </p>
          {canKits ? (
            <Button asChild variant="outline" size="sm" className="w-full shrink-0 sm:w-auto">
              <Link href="/painel/kits#conta">Ver a conta dos kits</Link>
            </Button>
          ) : null}
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
                <DeadlineTimer deadline={event.startsAt} doneLabel="AGORA" doneClassName="text-success-text" />
              </span>
              {/* No celular o selo não cabe na linha; a atualização automática continua. */}
              <LiveRefresh score={stats.present} className="hidden sm:inline-flex" />
            </div>
            <p className="relative mt-3 flex items-end gap-3">
              <span className="display text-7xl leading-none text-fg neon tabular" data-testid="stat-ready">
                {stats.registrationsReady}
              </span>
              <span className="display mb-1.5 text-2xl text-fg-muted tabular">/ {stats.registrationsExpected}</span>
              <span className="pixel mb-2 ml-auto text-sm text-red tabular">{readiness}%</span>
            </p>
            <p className="relative mt-1 text-sm font-semibold text-fg">prontos para entrar</p>
            {stats.registrationsExpected > 0 ? (
              <p className="relative mt-0.5 text-xs text-fg-muted" data-testid="expected-breakdown">
                Das inscrições: {registrationBreakdown}
              </p>
            ) : null}
            <SegmentMeter
              className="relative mt-3"
              value={stats.registrationsReady}
              max={stats.registrationsExpected}
              segments={24}
              label={`${stats.registrationsReady} de ${stats.registrationsExpected} prontos para entrar`}
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
              ) : stats.registrationsExpected > 0 ? (
                `Todo mundo já está liberado: agora é só a ${GAME.floor} abrir.`
              ) : (
                "Ainda sem inscrições."
              )}
            </p>
            {stats.organizationExpected > 0 ? (
              <p className="relative mt-3 border-t border-line/60 pt-3 text-xs text-fg-muted" data-testid="organization-breakdown">
                <strong className="text-fg">Fora desta conta, da organização:</strong> {organizationBreakdown} (cada um com voucher próprio).
              </p>
            ) : null}
          </div>
        ) : (
          <div className="relative overflow-clip rounded-2xl border border-red/40 bg-[linear-gradient(135deg,rgb(227_0_15/0.2),rgb(8_8_8/0.9)_55%)] p-5 shadow-[0_0_40px_-24px_var(--glow)]">
            <div className="halftone pointer-events-none absolute -top-10 -right-10 size-48 rounded-full opacity-30 [mask-image:radial-gradient(circle,#000_25%,transparent_70%)]" />
            <div className="relative flex items-center gap-2">
              <Led tone={stats.present > 0 ? "success" : "neutral"} blink={stats.present > 0} />
              <p className="pixel text-[0.55rem] text-fg-muted">{event && !event.started ? `Na ${GAME.floor} (antes do horário)` : `Na ${GAME.floor} agora`}</p>
              <LiveRefresh score={stats.present} className="ml-auto" />
            </div>
            <p className="relative mt-3 flex items-end gap-3">
              <span className="display text-7xl leading-none text-fg neon tabular" data-testid="stat-present">
                {stats.registrationsPresent}
              </span>
              <span className="display mb-1.5 text-2xl text-fg-muted tabular">/ {stats.registrationsExpected}</span>
              <span className="pixel mb-2 ml-auto text-sm text-red tabular">{presence}%</span>
            </p>
            {stats.registrationsExpected > 0 ? (
              <p className="relative mt-2 text-xs text-fg-muted" data-testid="expected-breakdown">
                Das inscrições: {registrationBreakdown}
              </p>
            ) : null}
            <SegmentMeter
              className="relative mt-4"
              value={stats.registrationsPresent}
              max={stats.registrationsExpected}
              segments={24}
              label={`${stats.registrationsPresent} de ${stats.registrationsExpected} presentes`}
            />
            <p className="relative mt-3 text-xs text-fg-muted">
              {registrationsAbsent === 1 ? "1 esperado ainda não entrou" : `${plural(registrationsAbsent, "esperado", "esperados")} ainda não entraram`} ·{" "}
              {canRegistrations ? (
                <Link href="/painel/inscricoes?filtro=ausentes" className="font-semibold text-red hover:underline">
                  ver quem falta
                </Link>
              ) : null}
            </p>
            {stats.organizationExpected > 0 ? (
              <p className="relative mt-3 border-t border-line/60 pt-3 text-xs text-fg-muted" data-testid="organization-breakdown">
                <strong className="text-fg">Da organização</strong> ({organizationBreakdown}): {stats.organizationPresent} de {stats.organizationExpected}{" "}
                já entraram · {plural(stats.present, "pessoa", "pessoas")} na festa ao todo.
              </p>
            ) : null}
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
            hint={kitParts(stats.kitsDeliveredMember, stats.kitsDeliveredGuest, employeeKitsDelivered, stats.kitsDeliveredCourtesy)}
            testId="stat-kits-delivered"
          />
          <div
            className={cn(
              "col-span-2 flex items-center justify-between gap-3 rounded-xl border bg-surface p-4",
              event?.kitDeadline?.passed ? "border-warning/50" : "border-line",
            )}
            data-testid="kit-deadline-card"
          >
            <div className="min-w-0">
              <p className="text-[0.7rem] font-bold tracking-[0.1em] text-fg-muted uppercase">Kits guardados</p>
              <p className="mt-1 text-sm text-fg">
                {event?.kitDeadline
                  ? event.kitDeadline.passed
                    ? `Sobras liberadas desde as ${event.kitDeadline.label}`
                    : `Até ${event.kitDeadline.label}`
                  : "A festa toda (sem horário)"}
              </p>
              {event?.kitDeadline?.passed ? (
                <p className="mt-0.5 text-xs text-fg-muted">
                  Quem entra agora leva o kit enquanto houver, inclusive quem estava na fila do kit.
                </p>
              ) : kitQueue > 0 ? (
                <p className="mt-0.5 text-xs text-fg-muted" data-testid="dashboard-kit-queue">
                  <strong className="text-warning">{kitQueue === 1 ? "1 kit na fila" : `${kitQueue} kits na fila`}</strong>: saem se vagar
                  {event?.kitDeadline ? ` ou, depois das ${event.kitDeadline.label}, se sobrar` : ""}.
                </p>
              ) : null}
            </div>
            {event?.kitDeadline && !event.kitDeadline.passed ? (
              <span className="flex shrink-0 items-center gap-2 rounded-md border border-line-strong bg-ink px-3 py-2">
                <Clock className="size-4 text-red" />
                <DeadlineTimer deadline={event.kitDeadline.at} doneLabel="SOBRAS" doneClassName="text-warning" />
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
        <StatTile
          label="Inscrições"
          value={stats.registrations}
          icon={List}
          href={canRegistrations ? "/painel/inscricoes?filtro=todas" : undefined}
          hint={stats.rejected ? plural(stats.rejected, "recusada", "recusadas") : undefined}
          testId="stat-registrations"
        />
        <StatTile label={T.People} value={stats.teachers} icon={PersonIcon} href={canRegistrations ? "/painel/inscricoes?filtro=todas" : undefined} testId="stat-teachers" hint={stats.otherMembers ? `+ ${plural(stats.otherMembers, "filiado", "filiados")} sem kit` : undefined} />
        <StatTile
          label="Convidados"
          value={stats.guests + stats.employeeGuests}
          icon={Users}
          href={canKits ? "/painel/kits#comparativo" : undefined}
          hint={stats.employeeGuests ? `${stats.employeeGuests} de colaboradores` : undefined}
          testId="stat-guests"
        />
        <StatTile label="Filiados confirmados" value={stats.confirmed} icon={Check} tone="success" testId="stat-confirmed" />
        <StatTile label="Aguardando conferência" value={stats.pending} icon={Clock} tone="warning" href={canRegistrations ? "/painel/inscricoes?filtro=conferir" : undefined} testId="stat-pending" />
        <StatTile label="Fichas para assinar" value={stats.draftForms} icon={ClipboardNote} tone="warning" href={canForms ? "/painel/filiacoes?filtro=assinar" : undefined} testId="stat-signature" />
        <StatTile label="Fichas assinadas" value={stats.joinedAtEvent} icon={Sparkles} href={canForms ? "/painel/filiacoes?filtro=FORMALIZED" : undefined} testId="stat-joined" />
        <StatTile
          label="Kits a entregar"
          value={stats.kitsOwedMember + stats.kitsOwedGuest + stats.kitsOwedEmployee}
          icon={Gift}
          tone="neutral"
          href={canKits ? "/painel/kits#comparativo" : undefined}
          hint={`${kitParts(stats.kitsOwedMember, stats.kitsOwedGuest, employeeKitsOwed, stats.kitsOwedCourtesy)} · saem na entrada${
            stats.kitWaitlist.member + stats.kitWaitlist.guest ? ` · ${stats.kitWaitlist.member + stats.kitWaitlist.guest} na fila do kit` : ""
          }`}
          testId="stat-kits-owed"
        />
        {/* Como os outros quadros, o número é o total; quem já entrou aparece embaixo, na festa. */}
        {employeesOnly > 0 || isAdmin ? (
          <StatTile
            label="Colaboradores"
            value={employeesOnly}
            icon={Building}
            tone="warning"
            href={canEmployees ? "/painel/colaboradores" : undefined}
            hint={
              !employeesOnly
                ? "Libere os colaboradores do SINDSERM"
                : !preEvent
                  ? plural(employeesOnlyPresent, "já entrou", "já entraram")
                  : stats.employeeGuests
                    ? `+ ${plural(stats.employeeGuests, "convidado", "convidados")} · liberados para entrar`
                    : "Liberados para entrar"
            }
            testId="stat-employees"
          />
        ) : null}
        {stats.courtesies > 0 ? (
          <StatTile
            label="Cortesias"
            value={stats.courtesies}
            icon={Heart}
            tone="brand"
            href={canEmployees ? "/painel/cortesias" : undefined}
            hint={
              !preEvent
                ? plural(stats.courtesiesPresent, "já entrou", "já entraram")
                : [stats.courtesiesWithKit ? `${stats.courtesiesWithKit} com kit` : null, courtesiesWithoutKit ? `${courtesiesWithoutKit} sem kit` : null]
                    .filter(Boolean)
                    .join(" · ")
            }
            testId="stat-courtesies"
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
                <Link href="/painel/kits#comparativo" data-testid="dashboard-people-kits">
                  Pessoas e kits
                </Link>
              </Button>
            ) : null
          }
        >
          {stock ? <StockCard stock={stock} demand={stats.kitDemand} waitlist={stats.kitWaitlist} /> : null}
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
                      {row.isTeacher ? T.Person : `Não ${T.person}`} · Matrícula {row.registrationNumber || "—"} ·{" "}
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
            <EmptyState icon={Login} title={`${GAME.Floor} vazia`}>
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
                    {entry.role === "EMPLOYEE" ? (entry.isCourtesy ? "Cort. · " : "Colab. · ") : entry.role === "GUEST" ? "P2 · " : "P1 · "}
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
