import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronRight, Gift, List, Login, UserPlus } from "@/components/icons/pixel";
import { PlayerTag } from "@/components/retro/bits";
import { AnimatedList } from "@/components/staff/animated-list";
import { ChipFilters, DayHeading, EmptyState, FilterBar, OrderToggle, PageHeader, Pagination } from "@/components/staff/panel-ui";
import { VerificationCard } from "@/components/staff/queue-cards";
import { WhatsAppButton } from "@/components/staff/whatsapp-button";
import { AffiliationBadge, TeacherBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { REGISTRATION_ORIGIN_LABEL } from "@/domain/labels";
import { can } from "@/domain/rules";
import { AFFILIATION_STATUSES, type AffiliationStatus } from "@/domain/types";
import { registrationWhatsappMessage } from "@/domain/whatsapp-messages";
import { formatTime, groupByDay } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { APP_NAME, getConfig } from "@/server/queries/config";
import {
  listOrder,
  listRegistrations,
  listVerificationQueue,
  pageNumber,
  queueCounts,
  registrationStatusCounts,
} from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Inscrições" };

/** "Aguardando conferência" não entra aqui: é a própria fila, o primeiro filtro. */
const STATUS_FILTERS = AFFILIATION_STATUSES.filter((status) => status !== "PENDING");

/** Rótulos dos filtros no plural (são grupos de inscrições, não ações). */
const FILTER_LABEL: Record<Exclude<AffiliationStatus, "PENDING">, string> = {
  AWAITING_SIGNATURE: "Esperando assinatura",
  CONFIRMED: "Confirmadas",
  REJECTED: "Não confirmadas",
  JOINED_AT_EVENT: "Filiaram-se na festa",
};

/** "entrou 19:42" / "ainda não entrou" — a portaria em cada linha. */
function Presence({ at }: { at: Date | null }) {
  return at ? (
    <span className="inline-flex items-center gap-1 font-bold text-success-text">
      <Login className="size-3.5" /> entrou {formatTime(at)}
    </span>
  ) : (
    <span className="text-fg-dim">ainda não entrou</span>
  );
}

export default async function RegistrationsPage({ searchParams }: PageProps<"/painel/inscricoes">) {
  const actor = await requirePageActor("viewRegistrations");
  const query = await searchParams;
  const q = typeof query.q === "string" && query.q.trim() ? query.q : undefined;
  const filtro = typeof query.filtro === "string" ? query.filtro : "";
  // Mais recentes primeiro, sempre (a fila também); "mais antigas" é escolha de quem está conferindo.
  const order = listOrder(query.ordem);
  const ordem = order === "antigas" ? "antigas" : undefined;
  const page = pageNumber(query.page);
  const [counts, statusCounts, config] = await Promise.all([queueCounts(), registrationStatusCounts(), getConfig()]);
  const eventName = config?.name ?? APP_NAME;
  // Sem filtro escolhido, abre direto na fila quando há inscrição esperando conferência. O filtro vai
  // para o endereço: ao conferir a última, a tela fica em "Fila zerada" em vez de pular para a lista.
  if (!filtro && counts.pending > 0) {
    const search = new URLSearchParams({ filtro: "conferir" });
    if (q) search.set("q", q);
    if (ordem) search.set("ordem", ordem);
    redirect(`/painel/inscricoes?${search.toString()}`);
  }
  const inQueue = filtro === "conferir" || filtro === "PENDING";
  const absent = filtro === "ausentes";
  const status = !inQueue && (STATUS_FILTERS as readonly string[]).includes(filtro) ? (filtro as AffiliationStatus) : null;
  const current = inQueue ? "conferir" : absent ? "ausentes" : (status ?? "todas");
  const [queue, list] = await Promise.all([
    inQueue ? listVerificationQueue({ kind: "PENDING", q, page, order }) : null,
    inQueue ? null : listRegistrations({ q, status, absent, page, order }),
  ]);
  const data = queue ?? list!;
  const today = statusCounts.today;
  const canOpenPeople = can(actor.access, "viewPeople");

  return (
    <div>
      <PageHeader
        eyebrow={inQueue ? "Fila de conferência" : "Grupos"}
        title="Inscrições"
        description={
          inQueue
            ? `Confira se quem declarou ser filiado(a) realmente é filiado(a) ao SINDSERM. ${
                order === "antigas" ? "Quem espera há mais tempo aparece primeiro." : "As mais recentes aparecem primeiro."
              }`
            : `${plural(statusCounts.total, "inscrição", "inscrições")}${today ? ` · ${today} hoje` : ""}. Cada uma é o(a) professor(a) ou filiado(a) e, se houver, o convidado. A busca acha também o convidado.`
        }
        actions={
          can(actor.access, "registerAtEvent") ? (
            <Button asChild>
              <Link href="/painel/inscricoes/nova">
                <UserPlus /> Cadastrar na hora
              </Link>
            </Button>
          ) : null
        }
      />
      <ChipFilters
        basePath="/painel/inscricoes"
        current={current}
        params={{ q, ordem }}
        options={[
          { value: "conferir", label: "Para conferir", count: counts.pending, attention: counts.pending > 0 },
          { value: "todas", label: "Todas", count: statusCounts.total },
          { value: "ausentes", label: "Ainda não entraram" },
          ...STATUS_FILTERS.filter((s) => (statusCounts.byStatus[s] ?? 0) > 0 || status === s).map((s) => ({
            value: s,
            label: FILTER_LABEL[s as Exclude<AffiliationStatus, "PENDING">],
            count: statusCounts.byStatus[s] ?? 0,
          })),
        ]}
      />
      <FilterBar action="/painel/inscricoes" q={q} placeholder="Nome, CPF, matrícula ou código (acha também o convidado)">
        <input type="hidden" name="filtro" value={current} />
        {ordem ? <input type="hidden" name="ordem" value={ordem} /> : null}
        <OrderToggle basePath="/painel/inscricoes" order={order} params={{ q, filtro: current }} />
      </FilterBar>

      {queue ? (
        queue.rows.length === 0 ? (
          <EmptyState icon={Check} title={q ? "Nada encontrado" : "Fila zerada"}>
            <p>{q ? "Ninguém na fila corresponde à busca." : "Todas as filiações declaradas já foram conferidas."}</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/painel/inscricoes?filtro=todas">Ver todas as inscrições</Link>
            </Button>
          </EmptyState>
        ) : (
          <AnimatedList
            items={groupByDay(queue.rows, (row) => row.createdAt).flatMap((group) => [
              { key: `dia-${group.key}`, content: <DayHeading title={group.title} count={group.rows.length} /> },
              ...group.rows.map((row) => ({
                key: row.registrationId,
                content: <VerificationCard row={row} canDecide={can(actor.access, "validateAffiliation")} eventName={eventName} />,
              })),
            ])}
          />
        )
      ) : list && list.rows.length === 0 ? (
        <EmptyState icon={List} title={q || status || absent ? "Nada encontrado" : "Nenhuma inscrição"}>
          {absent && !q ? "Todo mundo que está na lista já entrou." : q || status ? "Ajuste a busca ou o filtro." : "As inscrições feitas no site e na hora aparecem aqui."}
        </EmptyState>
      ) : list ? (
        <div className="space-y-4">
          {groupByDay(list.rows, (row) => row.createdAt).map((group) => (
            <section key={group.key} className="space-y-2">
              <DayHeading title={group.title} count={group.rows.length} />
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                <ul className="divide-y divide-line">
                  {group.rows.map((row) => (
                    <li
                      key={row.registrationId}
                      className={cn("relative flex items-start gap-3 px-4 py-3.5 sm:px-5", canOpenPeople && "transition-colors hover:bg-white/[0.04]")}
                      data-testid="registration-row"
                    >
                      {/* No celular, a hora vai para a linha de detalhes: sobra largura para o nome e os selos. */}
                      <span className="pixel hidden w-11 shrink-0 pt-1 text-[0.6rem] text-red tabular sm:block">{formatTime(row.createdAt)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {canOpenPeople ? (
                            // A linha inteira abre o cadastro (link "esticado"); convidado e WhatsApp ficam por cima.
                            <Link
                              href={`/painel/participantes/${row.personId}`}
                              className="truncate font-bold text-fg outline-none after:absolute after:inset-0 hover:text-red focus-visible:underline"
                              data-testid="registration-open"
                            >
                              {row.fullName}
                            </Link>
                          ) : (
                            <span className="truncate font-bold text-fg">{row.fullName}</span>
                          )}
                          <AffiliationBadge status={row.status} short />
                          <TeacherBadge isTeacher={row.isTeacher} />
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                          <span className="pixel text-[0.55rem] text-red tabular sm:hidden">{formatTime(row.createdAt)}</span>
                          <span className="rounded border border-line-strong px-1.5 py-px font-semibold" data-testid="registration-origin">
                            {REGISTRATION_ORIGIN_LABEL[row.origin]}
                          </span>
                          <Presence at={row.checkedInAt} />
                          {row.isTeacher ? (
                            <span className="inline-flex items-center gap-1">
                              <Gift className="size-3.5" /> {row.kitsDelivered}/{row.guestName ? 2 : 1} kits
                            </span>
                          ) : null}
                        </p>
                        {row.guestName ? (
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted" data-testid="registration-guest">
                            <PlayerTag player={2} className="scale-90" />
                            {canOpenPeople && row.guestPersonId ? (
                              <Link href={`/painel/participantes/${row.guestPersonId}`} className="relative z-10 font-semibold text-fg hover:text-red">
                                {row.guestName}
                              </Link>
                            ) : (
                              <span className="font-semibold text-fg">{row.guestName}</span>
                            )}
                            <Presence at={row.guestCheckedInAt} />
                          </p>
                        ) : (
                          <p className="mt-1.5 text-xs text-fg-dim">Sem convidado</p>
                        )}
                      </div>
                      <WhatsAppButton
                        phone={row.whatsapp}
                        name={row.fullName}
                        message={registrationWhatsappMessage({ fullName: row.fullName, status: row.status, eventName })}
                        compact
                        testId="registration-whatsapp"
                      />
                      {canOpenPeople ? <ChevronRight className="mt-2.5 hidden size-5 shrink-0 text-fg-dim sm:block" /> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      ) : null}
      <Pagination page={data.page} pages={data.pages} basePath="/painel/inscricoes" params={{ q, filtro: current, ordem }} />
    </div>
  );
}
