import type { Metadata } from "next";
import Link from "next/link";
import { Building, ChevronRight, Login, Users } from "@/components/icons/pixel";
import { ChipFilters, EmptyState, FilterBar, PageHeader, Pagination } from "@/components/staff/panel-ui";
import { AffiliationBadge, TeacherBadge, ToneBadge } from "@/components/status/status-badge";
import { can } from "@/domain/rules";
import { displayCpf } from "@/lib/cpf";
import { formatShortDateTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { listParticipants, pageNumber, type ParticipantFilter } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Participantes" };

const FILTERS: { value: ParticipantFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "teachers", label: "Professoras e professores" },
  { value: "members", label: "Filiados" },
  { value: "guests", label: "Convidados" },
  { value: "employees", label: "Funcionários" },
  { value: "pending", label: "Pendentes" },
  { value: "present", label: "Presentes" },
  { value: "absent", label: "Ausentes" },
];

export default async function ParticipantsPage({ searchParams }: PageProps<"/painel/participantes">) {
  const actor = await requirePageActor("viewPanel");
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : undefined;
  const filterParam = typeof query.filtro === "string" ? query.filtro : "all";
  const filter = (FILTERS.some((f) => f.value === filterParam) ? filterParam : "all") as ParticipantFilter;
  const page = pageNumber(query.page);
  const data = await listParticipants({ q, filter, page });
  const fullCpf = can(actor.role, "viewFullCpf");

  return (
    <div>
      <PageHeader
        eyebrow="Jogadores"
        title="Participantes"
        description={data.total === 1 ? "1 pessoa encontrada." : `${plural(data.total, "pessoa", "pessoas")} encontradas.`}
      />
      <ChipFilters
        basePath="/painel/participantes"
        current={filter === "all" ? "" : filter}
        params={{ q }}
        options={FILTERS.map((f) => ({ value: f.value === "all" ? "" : f.value, label: f.label }))}
      />
      <FilterBar action="/painel/participantes" q={q}>
        {filter !== "all" ? <input type="hidden" name="filtro" value={filter} /> : null}
      </FilterBar>
      {data.rows.length === 0 ? (
        <EmptyState icon={Users} title="Ninguém por aqui">
          Ajuste a busca ou os filtros.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {data.rows.map((row) => (
              <li key={row.personId}>
                <Link
                  href={`/painel/participantes/${row.personId}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.04] sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-fg">{row.fullName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                      <span className="font-mono">{displayCpf(row.cpf, fullCpf)}</span>
                      {row.isEmployee ? (
                        <ToneBadge tone="warning" icon={Building}>
                          Funcionário(a){row.employeeJobTitle ? ` · ${row.employeeJobTitle}` : ""}
                        </ToneBadge>
                      ) : null}
                      {row.memberStatus ? <AffiliationBadge status={row.memberStatus} short /> : null}
                      {row.memberStatus ? <TeacherBadge isTeacher={Boolean(row.isTeacher)} /> : null}
                      {row.hostName ? (
                        <ToneBadge tone="info" icon={Users}>
                          Convidado de {row.hostName}
                          {row.hostIsEmployee ? " (funcionário)" : ""}
                        </ToneBadge>
                      ) : null}
                      {row.isMinor ? <ToneBadge tone="warning">Menor</ToneBadge> : null}
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right text-xs sm:block">
                    {row.checkedInAt ? (
                      <span className="inline-flex items-center gap-1 font-bold text-success-text">
                        <Login className="size-4" /> {formatShortDateTime(row.checkedInAt)}
                      </span>
                    ) : (
                      <span className="text-fg-dim">Sem entrada</span>
                    )}
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-fg-dim" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pagination page={data.page} pages={data.pages} basePath="/painel/participantes" params={{ q, filtro: filter === "all" ? undefined : filter }} />
    </div>
  );
}
