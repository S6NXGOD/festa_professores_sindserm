import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Gift, List, Login, UserPlus, Users } from "@/components/icons/pixel";
import { ChipFilters, EmptyState, FilterBar, PageHeader, Pagination } from "@/components/staff/panel-ui";
import { AffiliationBadge, TeacherBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { AFFILIATION_STATUS_SHORT } from "@/domain/labels";
import { AFFILIATION_STATUSES, type AffiliationStatus } from "@/domain/types";
import { formatShortDateTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { listRegistrations, pageNumber } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Inscrições" };

export default async function RegistrationsPage({ searchParams }: PageProps<"/painel/inscricoes">) {
  await requirePageActor("viewPanel");
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : undefined;
  const statusParam = typeof query.filtro === "string" ? query.filtro : "";
  const status = (AFFILIATION_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as AffiliationStatus) : null;
  const page = pageNumber(query.page);
  const data = await listRegistrations({ q, status, page });

  return (
    <div>
      <PageHeader
        eyebrow="Grupos"
        title="Inscrições"
        description={`${plural(data.total, "inscrição", "inscrições")}: cada uma é o(a) professor(a) ou filiado(a) e, se houver, o convidado.`}
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
        current={status ?? ""}
        params={{ q }}
        options={[{ value: "", label: "Todas" }, ...AFFILIATION_STATUSES.map((s) => ({ value: s, label: AFFILIATION_STATUS_SHORT[s] }))]}
      />
      <FilterBar action="/painel/inscricoes" q={q}>
        {status ? <input type="hidden" name="filtro" value={status} /> : null}
      </FilterBar>
      {data.rows.length === 0 ? (
        <EmptyState icon={List} title="Nenhuma inscrição">
          As inscrições feitas no site e na hora aparecem aqui.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {data.rows.map((row) => (
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
      )}
      <Pagination page={data.page} pages={data.pages} basePath="/painel/inscricoes" params={{ q, filtro: status ?? undefined }} />
    </div>
  );
}
