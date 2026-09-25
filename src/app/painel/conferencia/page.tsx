import type { Metadata } from "next";
import Link from "next/link";
import { Check, ClipboardNote, Phone, Users } from "@/components/icons/pixel";
import { AffiliationDecisionButtons, SignatureButtons } from "@/components/staff/affiliation-decision-buttons";
import { EmptyState, FilterBar, PageHeader, Pagination } from "@/components/staff/panel-ui";
import { TeacherBadge } from "@/components/status/status-badge";
import { formatCpf } from "@/lib/cpf";
import { formatShortDateTime } from "@/lib/datetime";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { listVerificationQueue, pageNumber, queueCounts, type QueueKind } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Conferência" };

export default async function VerificationQueuePage({ searchParams }: PageProps<"/painel/conferencia">) {
  await requirePageActor("validateAffiliation");
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : undefined;
  const kind: QueueKind = query.fila === "assinatura" ? "AWAITING_SIGNATURE" : "PENDING";
  const page = pageNumber(query.page);
  const [data, counts] = await Promise.all([listVerificationQueue({ kind, q, page }), queueCounts()]);
  const signature = kind === "AWAITING_SIGNATURE";

  const tabs = [
    { href: "/painel/conferencia", label: "Conferir filiação", count: counts.pending, active: !signature, icon: Check },
    { href: "/painel/conferencia?fila=assinatura", label: "Fichas para assinar", count: counts.awaitingSignature, active: signature, icon: ClipboardNote },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Fila"
        title="Conferência"
        description={
          signature
            ? "Pessoas que preencheram a ficha de filiação antes da festa: imprima, colha a assinatura e confirme."
            : "Confira se quem declarou ser filiado(a) realmente é filiado(a) ao SINDSERM."
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "flex items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 font-bold transition-colors",
              tab.active ? "border-red bg-brand-soft text-fg" : "border-line-strong text-fg-muted hover:text-fg",
            )}
          >
            <span className="flex items-center gap-2">
              <tab.icon className={cn("size-5", tab.active ? "text-red" : "text-fg-dim")} />
              {tab.label}
            </span>
            <span className="pixel text-[0.6rem] text-red tabular">{tab.count}</span>
          </Link>
        ))}
      </div>
      <FilterBar action={signature ? "/painel/conferencia?fila=assinatura" : "/painel/conferencia"} q={q}>
        {signature ? <input type="hidden" name="fila" value="assinatura" /> : null}
      </FilterBar>
      {data.rows.length === 0 ? (
        <EmptyState icon={signature ? ClipboardNote : Check} title={q ? "Nada encontrado" : "Fila zerada"}>
          {q ? "Ninguém nesta fila corresponde à busca." : signature ? "Nenhuma ficha esperando assinatura." : "Todas as filiações declaradas já foram conferidas."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.rows.map((row) => (
            <li key={row.registrationId} className="rounded-xl border border-line bg-surface p-4 sm:p-5" data-testid="queue-item">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/painel/participantes/${row.personId}`} className="display text-2xl text-fg hover:text-red">
                      {row.fullName}
                    </Link>
                    <TeacherBadge isTeacher={row.isTeacher} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-fg-dim">CPF</dt>
                      <dd className="font-mono font-semibold text-fg">{formatCpf(row.cpf)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-dim">Matrícula</dt>
                      <dd className="font-semibold text-fg">{row.registrationNumber ?? "—"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-fg-dim">{signature ? "Cargo · lotação" : "Lotação"}</dt>
                      <dd className="font-semibold text-fg">
                        {signature && row.jobTitle ? `${row.jobTitle} · ` : ""}
                        {row.workplace ?? "—"}
                      </dd>
                    </div>
                  </dl>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3.5" /> {formatPhone(row.whatsapp) || "—"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" /> {row.guestName ? `Convidado: ${row.guestName}` : "Sem convidado"}
                    </span>
                    <span>Inscrito {formatShortDateTime(row.createdAt)}</span>
                    {row.origin === "STAFF" ? <span>Cadastrado pela equipe</span> : null}
                  </p>
                </div>
                {signature && row.formId ? (
                  <SignatureButtons formId={row.formId} name={row.fullName} />
                ) : (
                  <AffiliationDecisionButtons registrationId={row.registrationId} name={row.fullName} isTeacher={row.isTeacher} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={data.page}
        pages={data.pages}
        basePath="/painel/conferencia"
        params={{ q, fila: signature ? "assinatura" : undefined }}
      />
    </div>
  );
}
