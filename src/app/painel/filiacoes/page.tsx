import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ClipboardNote, Plus } from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { AnimatedList } from "@/components/staff/animated-list";
import { ChipFilters, EmptyState, FilterBar, PageHeader, Pagination } from "@/components/staff/panel-ui";
import { SignatureCard } from "@/components/staff/queue-cards";
import { TeacherBadge, ToneBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { formatShortDateTime } from "@/lib/datetime";
import { listAffiliationForms, pageNumber, queueCounts } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Fichas de filiação" };

const STATUS = {
  DRAFT: { label: "Para assinar", tone: "warning" },
  FORMALIZED: { label: "Assinada", tone: "success" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
} as const;

export default async function AffiliationFormsPage({ searchParams }: PageProps<"/painel/filiacoes">) {
  await requirePageActor("viewForms");
  const query = await searchParams;
  const filtro = typeof query.filtro === "string" ? query.filtro : "";
  const q = typeof query.q === "string" ? query.q : undefined;
  const page = pageNumber(query.page);
  const counts = await queueCounts();
  // Sem filtro escolhido, abre direto na fila quando há ficha esperando assinatura (o filtro vai para
  // o endereço, para a tela não pular para a lista quando a última ficha for resolvida).
  if (!filtro && counts.signature > 0) redirect(q ? `/painel/filiacoes?filtro=assinar&q=${encodeURIComponent(q)}` : "/painel/filiacoes?filtro=assinar");
  const inQueue = filtro === "assinar" || filtro === "DRAFT";
  const status = inQueue ? "DRAFT" : filtro === "FORMALIZED" || filtro === "CANCELLED" ? filtro : null;
  const current = inQueue ? "assinar" : (status ?? "todas");
  const data = await listAffiliationForms({ status, q, page });

  return (
    <div>
      <PageHeader
        eyebrow={inQueue ? "Fila de assinatura" : "Novos filiados"}
        title="Fichas de filiação"
        description={
          inQueue
            ? "Fichas esperando a assinatura na recepção: imprima, colha a assinatura e confirme. Sem RG e contracheque anexados, a assinatura fica travada."
            : "Fichas preenchidas no site (antes da festa) ou no Atendimento. Assinada = filiado(a) na festa."
        }
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
        current={current}
        params={{ q }}
        options={[
          { value: "assinar", label: "Para assinar", count: counts.signature, attention: counts.signature > 0 },
          { value: "todas", label: "Todas" },
          { value: "FORMALIZED", label: "Assinadas" },
          { value: "CANCELLED", label: "Canceladas" },
        ]}
      />
      <FilterBar action="/painel/filiacoes" q={q}>
        <input type="hidden" name="filtro" value={current} />
      </FilterBar>
      {data.rows.length === 0 ? (
        <EmptyState icon={ClipboardNote} title={inQueue && !q ? "Nenhuma ficha para assinar" : q || status ? "Nada encontrado" : "Nenhuma ficha"}>
          <p>
            {q
              ? "Nenhuma ficha corresponde à busca."
              : inQueue
                ? "As fichas preenchidas no site ou no Atendimento esperam a assinatura aqui."
                : "As fichas preenchidas no site e no Atendimento aparecem aqui."}
          </p>
          {inQueue ? (
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/painel/filiacoes?filtro=todas">Ver todas as fichas</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : inQueue ? (
        <AnimatedList items={data.rows.map((row) => ({ key: row.id, content: <SignatureCard row={row} /> }))} />
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
      <Pagination page={data.page} pages={data.pages} basePath="/painel/filiacoes" params={{ q, filtro: current }} />
    </div>
  );
}
