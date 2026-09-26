import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GatePersonClient } from "@/components/gate/gate-person-client";
import { ArrowLeft, Check, Database, Pencil, Printer, User, Users } from "@/components/icons/pixel";
import { PlayerTag } from "@/components/retro/bits";
import { AuditTimeline } from "@/components/staff/audit-timeline";
import { CategoryChip } from "@/components/staff/employee-category";
import { EditEmployeeDialog } from "@/components/staff/employee-dialogs";
import { Panel } from "@/components/staff/panel-ui";
import { PersonCorrectionDialog } from "@/components/staff/person-correction-dialog";
import { RenewAccessButton } from "@/components/staff/renew-access-button";
import { WhatsAppButton } from "@/components/staff/whatsapp-button";
import { AffiliationBadge, TeacherBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { homePathFor } from "@/domain/access";
import { EMPLOYEE_CATEGORY_TITLE, REGISTRATION_ORIGIN_LABEL } from "@/domain/labels";
import { can } from "@/domain/rules";
import type { AffiliationStatus } from "@/domain/types";
import { personWhatsappMessage, registrationWhatsappMessage } from "@/domain/whatsapp-messages";
import { displayCpf, formatCpf } from "@/lib/cpf";
import { formatDateTime } from "@/lib/datetime";
import { formatPhone, maskPhoneInput } from "@/lib/phone";
import { db } from "@/server/db";
import { APP_NAME, getConfig } from "@/server/queries/config";
import { getFormerGuests, recentAuditFor } from "@/server/queries/panel";
import { buildGateView } from "@/server/services/gate-view";
import { getEventConfig, getStockOverview } from "@/server/services/settings";
import { loadPersonState } from "@/server/services/state";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Cadastro" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A última mudança de situação da inscrição, em palavras ("Confirmada em ... por ..."). */
const STATUS_CHANGE_LABEL: Record<AffiliationStatus, string> = {
  PENDING: "Reaberta",
  AWAITING_SIGNATURE: "Atualizada",
  CONFIRMED: "Confirmada",
  REJECTED: "Não confirmada",
  JOINED_AT_EVENT: "Ficha assinada",
};

/**
 * Cadastro de uma pessoa: tudo num lugar só (inscrição do grupo, portaria,
 * dados, vouchers, ex-convidados e histórico). Abre para quem vê Inscrições e,
 * no caso de colaboradores e convidados deles, também para quem vê Colaboradores.
 */
export default async function PersonPage({ params, searchParams }: PageProps<"/painel/participantes/[id]">) {
  const actor = await requirePageActor();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [state, eventConfig, stock, config] = await Promise.all([loadPersonState(db, id), getEventConfig(db), getStockOverview(db), getConfig()]);
  if (!state) notFound();
  const fromEmployees = Boolean(state.employee || state.guestOfEmployee);
  const canPeople = can(actor.access, "viewPeople");
  if (!canPeople && !(fromEmployees && can(actor.access, "viewEmployees"))) redirect(homePathFor(actor.access));

  const eventName = config?.name ?? APP_NAME;
  const view = buildGateView(state, actor.access, eventConfig, new Date(), stock);
  const person = state.person;
  const registration = state.ownRegistration;
  const employee = state.employee;
  const host = state.guestOf?.host ?? null;
  const employeeHost = state.guestOfEmployee?.host ?? null;
  const [former, history] = await Promise.all([
    registration ? getFormerGuests(registration.id) : Promise.resolve([]),
    // Histórico da pessoa, da inscrição dela e, para colaboradores, do cadastro de colaborador (convidado incluído).
    recentAuditFor([person.id, registration?.id, employee?.id].filter((v): v is string => Boolean(v)), 40),
  ]);
  const fullCpf = can(actor.access, "viewFullCpf");
  const kind = employee ? "employee" : registration ? "member" : "guest";
  const canVouchers = can(actor.access, "reissueVoucher");
  const hostPersonId = host?.member.id ?? employeeHost?.person.id ?? null;
  const hostName = host?.member.fullName ?? employeeHost?.person.fullName ?? null;
  const back = !canPeople && fromEmployees ? { href: "/painel/colaboradores", label: "Colaboradores" } : { href: "/painel/inscricoes", label: "Inscrições" };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="-ml-2">
        <Link href={back.href}>
          <ArrowLeft /> {back.label}
        </Link>
      </Button>

      {query.nova === "1" ? (
        <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success-soft p-4 text-sm font-semibold text-fg" role="status">
          <Check className="mt-0.5 size-5 shrink-0 text-success-text" />
          <p>
            Inscrição gravada! Confira a filiação abaixo. Para imprimir os vouchers (do(a) professor(a) e do convidado numa folha
            só), use <strong>Imprimir vouchers</strong>.
          </p>
        </div>
      ) : null}

      {/* Cabeçalho: quem é a pessoa e as ações do grupo. */}
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-start sm:justify-between" data-testid="person-header">
        <div className="min-w-0">
          <p className="pixel text-[0.55rem] text-red">
            {kind === "member" ? "Inscrição" : kind === "employee" ? "Colaborador(a) do SINDSERM" : "Convidado(a)"}
          </p>
          <h1 className="display mt-1 text-4xl break-words text-fg">{person.fullName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            {registration ? (
              <>
                <AffiliationBadge status={registration.status} />
                <TeacherBadge isTeacher={registration.isTeacher} />
                {/* Origem e data juntas: se não couber, descem inteiras para a linha de baixo. */}
                <span>
                  {REGISTRATION_ORIGIN_LABEL[registration.origin]} · {formatDateTime(registration.createdAt)}
                </span>
              </>
            ) : employee ? (
              <>
                <CategoryChip category={employee.category} />
                <span className="font-semibold text-fg">{employee.jobTitle ?? "Setor não informado"}</span>
              </>
            ) : hostName ? (
              <>
                <PlayerTag player={2} />
                <span>
                  Convidado(a) de{" "}
                  {hostPersonId ? (
                    <Link href={`/painel/participantes/${hostPersonId}`} className="font-bold text-fg underline-offset-4 hover:text-red hover:underline">
                      {hostName}
                    </Link>
                  ) : (
                    hostName
                  )}
                  {employeeHost ? ` (${EMPLOYEE_CATEGORY_TITLE[employeeHost.category]})` : ""}
                </span>
              </>
            ) : null}
          </div>
          {registration?.statusChangedAt ? (
            <p className="mt-1.5 text-xs text-fg-muted" data-testid="person-status-changed">
              {STATUS_CHANGE_LABEL[registration.status]} em {formatDateTime(registration.statusChangedAt)}
              {registration.statusChangedByName ? ` por ${registration.statusChangedByName}` : ""}
            </p>
          ) : null}
          {registration?.statusNote ? <p className="mt-2 text-sm text-fg-muted">Observação: {registration.statusNote}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <WhatsAppButton
            phone={person.whatsapp}
            name={person.fullName}
            message={
              registration
                ? registrationWhatsappMessage({ fullName: person.fullName, status: registration.status, eventName })
                : personWhatsappMessage({ fullName: person.fullName, eventName })
            }
            testId="person-whatsapp"
          />
          {registration && canVouchers ? (
            <>
              <Button asChild variant="outline">
                <Link href={`/painel/inscricoes/${registration.id}/vouchers`} data-testid="print-group-vouchers">
                  <Printer /> {registration.guest ? "Imprimir vouchers (2)" : "Imprimir voucher"}
                </Link>
              </Button>
              <RenewAccessButton registrationId={registration.id} />
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <GatePersonClient key={view.personId} view={view} personBasePath="/painel/participantes" />
        <div className="space-y-6">
          <Panel
            title="Dados cadastrais"
            icon={User}
            action={
              employee && can(actor.access, "manageEmployees") ? (
                <EditEmployeeDialog
                  initial={{
                    employeeId: employee.id,
                    fullName: person.fullName,
                    cpf: person.cpf ? formatCpf(person.cpf) : "",
                    whatsapp: person.whatsapp ? maskPhoneInput(person.whatsapp) : "",
                    jobTitle: employee.jobTitle ?? "",
                    category: employee.category,
                  }}
                  trigger={
                    <Button variant="outline" size="sm" data-testid="edit-employee-data">
                      <Pencil /> Corrigir dados
                    </Button>
                  }
                />
              ) : !employee && can(actor.access, "manageGuests") ? (
                <PersonCorrectionDialog
                  kind={kind}
                  initial={{
                    personId: person.id,
                    fullName: person.fullName,
                    cpf: formatCpf(person.cpf),
                    whatsapp: person.whatsapp ?? "",
                    registrationNumber: person.registrationNumber ?? "",
                    workplace: person.workplace ?? "",
                    isMinor: person.isMinor,
                  }}
                />
              ) : null
            }
          >
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Info label="CPF" value={displayCpf(person.cpf, fullCpf)} mono />
              <Info label="WhatsApp" value={formatPhone(person.whatsapp) || "—"} />
              {kind === "member" ? (
                <>
                  <Info label="Matrícula" value={person.registrationNumber ?? "—"} />
                  <Info label="Lotação" value={person.workplace ?? "—"} />
                </>
              ) : null}
              {kind !== "employee" ? <Info label="Menor de 18" value={person.isMinor ? "Sim" : "Não"} /> : null}
              <Info label="Cadastrado em" value={formatDateTime(person.createdAt)} />
            </dl>
          </Panel>
          {former.length ? (
            <Panel title="Ex-convidados" icon={Users}>
              <ul className="space-y-2 text-sm">
                {former.map((guest) => (
                  <li key={guest.guestLinkId} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/painel/participantes/${guest.personId}`} className="font-semibold text-fg hover:text-red">
                      {guest.fullName}
                    </Link>
                    <span className="text-xs text-fg-muted">
                      {guest.status === "CONVERTED" ? "Virou filiado(a)" : (guest.endReason ?? "Removido(a)")} · {formatDateTime(guest.endedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel title="Histórico" icon={Database}>
            <AuditTimeline entries={history} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <dt className="text-[0.68rem] font-bold tracking-[0.08em] text-fg-dim uppercase">{label}</dt>
      <dd className={mono ? "font-mono font-semibold text-fg" : "font-semibold break-words text-fg"}>{value}</dd>
    </div>
  );
}
