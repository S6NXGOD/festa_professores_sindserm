import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GatePersonClient } from "@/components/gate/gate-person-client";
import { ArrowLeft, Check, Database, Printer, User, Users } from "@/components/icons/pixel";
import { AuditTimeline } from "@/components/staff/audit-timeline";
import { Panel } from "@/components/staff/panel-ui";
import { RenewAccessButton } from "@/components/staff/renew-access-button";
import { AffiliationBadge, TeacherBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import type { RegistrationOrigin } from "@/server/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/server/db";
import { getFormerGuests, recentAuditFor } from "@/server/queries/panel";
import { buildGateView } from "@/server/services/gate-view";
import { getEventConfig, getStockOverview } from "@/server/services/settings";
import { loadPersonState, loadRegistrationState } from "@/server/services/state";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Inscrição" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORIGIN_LABEL: Record<RegistrationOrigin, string> = {
  PUBLIC_FORM: "Formulário público",
  PRE_AFFILIATION: "Ficha de filiação preenchida no site",
  STAFF: "Cadastro na hora (equipe)",
  GUEST_CONVERSION: "Convidado(a) cadastrado(a) como filiado(a)",
  NEW_AFFILIATION: "Filiação feita na festa",
};

export default async function RegistrationDetailPage({ params, searchParams }: PageProps<"/painel/inscricoes/[id]">) {
  const actor = await requirePageActor("viewPanel");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const registration = await loadRegistrationState(db, id);
  if (!registration) notFound();
  const [memberState, former, audit, config, stock] = await Promise.all([
    loadPersonState(db, registration.member.id),
    getFormerGuests(id),
    recentAuditFor([id], 40),
    getEventConfig(db),
    getStockOverview(db),
  ]);
  if (!memberState) notFound();
  const view = buildGateView(memberState, actor.role, config, new Date(), stock);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="-ml-2">
        <Link href="/painel/inscricoes">
          <ArrowLeft /> Inscrições
        </Link>
      </Button>

      {query.nova === "1" ? (
        <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success-soft p-4 text-sm font-semibold text-fg" role="status">
          <Check className="mt-0.5 size-5 shrink-0 text-success-text" />
          <p>
            Inscrição gravada! Confira a filiação abaixo. Para imprimir os vouchers (do(a) professor(a) e do convidado numa
            folha só), use <strong>Imprimir vouchers</strong>.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="pixel text-[0.55rem] text-red">Inscrição</p>
          <h1 className="display mt-1 text-4xl text-fg">{registration.member.fullName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <AffiliationBadge status={registration.status} />
            <TeacherBadge isTeacher={registration.isTeacher} />
            <span>{ORIGIN_LABEL[registration.origin]}</span>
            <span>· {formatDateTime(registration.createdAt)}</span>
            {registration.statusChangedAt ? (
              <span>
                · Atualizada {formatDateTime(registration.statusChangedAt)}
                {registration.statusChangedByName ? ` por ${registration.statusChangedByName}` : ""}
              </span>
            ) : null}
          </div>
          {registration.statusNote ? <p className="mt-2 text-sm text-fg-muted">Observação: {registration.statusNote}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/painel/participantes/${registration.member.id}`}>
              <User /> Cadastro
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/painel/inscricoes/${registration.id}/vouchers`} data-testid="print-group-vouchers">
              <Printer /> {registration.guest ? "Imprimir vouchers (2)" : "Imprimir voucher"}
            </Link>
          </Button>
          <RenewAccessButton registrationId={registration.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <GatePersonClient key={view.personId} view={view} personBasePath="/painel/participantes" />
        <div className="space-y-6">
          {former.length ? (
            <Panel title="Ex-convidados" icon={Users}>
              <ul className="space-y-2 text-sm">
                {former.map((guest) => (
                  <li key={guest.guestLinkId} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/painel/participantes/${guest.personId}`} className="font-semibold text-fg hover:text-red">
                      {guest.fullName}
                    </Link>
                    <span className="text-xs text-fg-muted">
                      {guest.status === "CONVERTED" ? "Virou filiado(a)" : guest.endReason ?? "Removido(a)"} · {formatDateTime(guest.endedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel title="Auditoria da inscrição" icon={Database}>
            <AuditTimeline entries={audit} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
