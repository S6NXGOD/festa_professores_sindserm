import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronRight, Gift, List, Login, UserPlus, Users } from "@/components/icons/pixel";
import { AnimatedList } from "@/components/staff/animated-list";
import { ChipFilters, EmptyState, FilterBar, PageHeader, Pagination } from "@/components/staff/panel-ui";
import { VerificationCard } from "@/components/staff/queue-cards";
import { AffiliationBadge, TeacherBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { AFFILIATION_STATUS_SHORT } from "@/domain/labels";
import { can } from "@/domain/rules";
import { AFFILIATION_STATUSES, type AffiliationStatus } from "@/domain/types";
import { formatShortDateTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { listRegistrations, listVerificationQueue, pageNumber, queueCounts } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Inscrições" };

/** "Aguardando conferência" não entra aqui: é a própria fila, o primeiro filtro. */
const STATUS_FILTERS = AFFILIATION_STATUSES.filter((status) => status !== "PENDING");

export default async function RegistrationsPage({ searchParams }: PageProps<"/painel/inscricoes">) {
  const actor = await requirePageActor("viewPanel");
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : undefined;
  const filtro = typeof query.filtro === "string" ? query.filtro : "";
  const page = pageNumber(query.page);
  const counts = await queueCounts();
  // Sem filtro escolhido, abre direto na fila quando há inscrição esperando conferência. O filtro vai
  // para o endereço: ao conferir a última, a tela fica em "Fila zerada" em vez de pular para a lista.
  if (!filtro && counts.pending > 0) redirect(q ? `/painel/inscricoes?filtro=conferir&q=${encodeURIComponent(q)}` : "/painel/inscricoes?filtro=conferir");
  const inQueue = filtro === "conferir" || filtro === "PENDING";
  const status = !inQueue && (STATUS_FILTERS as readonly string[]).includes(filtro) ? (filtro as AffiliationStatus) : null;
  const current = inQueue ? "conferir" : (status ?? "todas");
  const [queue, list] = await Promise.all([
    inQueue ? listVerificationQueue({ kind: "PENDING", q, page }) : null,
    inQueue ? null : listRegistrations({ q, status, page }),
  ]);
  const data = queue ?? list!;

  return (
    <div>
      <PageHeader
        eyebrow={inQueue ? "Fila de conferência" : "Grupos"}
        title="Inscrições"
        description={
          inQueue
            ? "Confira se quem declarou ser filiado(a) realmente é filiado(a) ao SINDSERM. Quem espera há mais tempo aparece primeiro."
            : `${plural(data.total, "inscrição", "inscrições")}: cada uma é o(a) professor(a) ou filiado(a) e, se houver, o convidado.`
        }
        actions={
          <Button asChild>
            <Link href="/painel/inscricoes/nova">
              <UserPlus /> Cadastrar na hora
            </Link>
          </Button>
        }
      />
      <ChipFilters
        basePath="/painel/inscricoes"
        current={current}
        params={{ q }}
        options={[
          { value: "conferir", label: "Para conferir", count: counts.pending, attention: counts.pending > 0 },
          { value: "todas", label: "Todas" },
          ...STATUS_FILTERS.map((s) => ({ value: s, label: AFFILIATION_STATUS_SHORT[s] })),
        ]}
      />
      <FilterBar action="/painel/inscricoes" q={q}>
        <input type="hidden" name="filtro" value={current} />
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
            items={queue.rows.map((row) => ({
              key: row.registrationId,
              content: <VerificationCard row={row} canDecide={can(actor.role, "validateAffiliation")} />,
            }))}
          />
        )
      ) : list && list.rows.length === 0 ? (
        <EmptyState icon={List} title={q || status ? "Nada encontrado" : "Nenhuma inscrição"}>
          {q || status ? "Ajuste a busca ou o filtro." : "As inscrições feitas no site e na hora aparecem aqui."}
        </EmptyState>
      ) : list ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {list.rows.map((row) => (
              <li key={row.registrationId}>
                <Link
                  href={`/painel/inscricoes/${row.registrationId}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.04] sm:px-5"
                  data-testid="registration-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold text-fg">{row.fullName}</p>
                      <AffiliationBadge status={row.status} short />
                      <TeacherBadge isTeacher={row.isTeacher} />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" /> {row.guestName ?? "sem convidado"}
                      </span>
                      {row.isTeacher ? (
                        <span className="inline-flex items-center gap-1">
                          <Gift className="size-3.5" /> {row.kitsDelivered}/{row.guestName ? 2 : 1} kits
                        </span>
                      ) : null}
                      {row.checkedIn ? (
                        <span className="inline-flex items-center gap-1 font-bold text-success-text">
                          <Login className="size-3.5" /> presente
                        </span>
                      ) : null}
                      <span>{formatShortDateTime(row.createdAt)}</span>
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-fg-dim" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Pagination page={data.page} pages={data.pages} basePath="/painel/inscricoes" params={{ q, filtro: current }} />
    </div>
  );
}
