import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardNote, Plus } from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { ChipFilters, EmptyState, FilterBar, PageHeader, Pagination } from "@/components/staff/panel-ui";
import { TeacherBadge, ToneBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { formatShortDateTime } from "@/lib/datetime";
import { listAffiliationForms, pageNumber } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Fichas de filiação" };

const STATUS = {
  DRAFT: { label: "Para assinar", tone: "warning" },
  FORMALIZED: { label: "Assinada", tone: "success" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
} as const;

export default async function AffiliationFormsPage({ searchParams }: PageProps<"/painel/filiacoes">) {
  await requirePageActor("newAffiliation");
  const query = await searchParams;
  const statusParam = typeof query.filtro === "string" ? query.filtro : "";
  const status = Object.hasOwn(STATUS, statusParam) ? (statusParam as keyof typeof STATUS) : null;
  const q = typeof query.q === "string" ? query.q : undefined;
  const page = pageNumber(query.page);
  const data = await listAffiliationForms({ status, q, page });

  return (
    <div>
      <PageHeader
        eyebrow="Novos filiados"
        title="Fichas de filiação"
        description="Fichas preenchidas no site (antes da festa) ou no Atendimento. Assinada = filiado(a) na festa."
        actions={
          <Button asChild>
            <Link href="/painel/filiacoes/nova">
              <Plus /> Nova ficha
            </Link>
          </Button>
        }
      />
      <ChipFilters
        basePath="/painel/filiacoes"
        current={status ?? ""}
        params={{ q }}
        options={[
          { value: "", label: "Todas" },
          { value: "DRAFT", label: STATUS.DRAFT.label },
          { value: "FORMALIZED", label: STATUS.FORMALIZED.label },
          { value: "CANCELLED", label: STATUS.CANCELLED.label },
        ]}
      />
      <FilterBar action="/painel/filiacoes" q={q}>
        {status ? <input type="hidden" name="filtro" value={status} /> : null}
      </FilterBar>
      {data.rows.length === 0 ? (
        <EmptyState icon={ClipboardNote} title="Nenhuma ficha">
          As fichas preenchidas no site e no Atendimento aparecem aqui.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {data.rows.map((row) => (
              <li key={row.id}>
                <Link href={`/painel/filiacoes/${row.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.04] sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-fg">{row.fullName}</p>
                      <ToneBadge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</ToneBadge>
                      <TeacherBadge isTeacher={row.isTeacher} />
                      {row.origin === "PUBLIC" ? <PixelTag tone="neutral">Site</PixelTag> : null}
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      {row.origin === "PUBLIC" ? "Preenchida pelo(a) interessado(a)" : `Registrada por ${row.createdBy ?? "equipe"}`}{" "}
                      {formatShortDateTime(row.createdAt)}
                      {row.formalizedAt ? ` · assinada ${formatShortDateTime(row.formalizedAt)}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="size-5 text-fg-dim" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pagination page={data.page} pages={data.pages} basePath="/painel/filiacoes" params={{ q, filtro: status ?? undefined }} />
    </div>
  );
}
