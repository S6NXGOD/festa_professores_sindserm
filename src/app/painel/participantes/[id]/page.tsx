import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GatePersonClient } from "@/components/gate/gate-person-client";
import { ArrowLeft, Database, List, Pencil, User } from "@/components/icons/pixel";
import { AuditTimeline } from "@/components/staff/audit-timeline";
import { Panel } from "@/components/staff/panel-ui";
import { CategoryChip } from "@/components/staff/employee-category";
import { EditEmployeeDialog } from "@/components/staff/employee-dialogs";
import { PersonCorrectionDialog } from "@/components/staff/person-correction-dialog";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/rules";
import { displayCpf, formatCpf } from "@/lib/cpf";
import { formatDateTime } from "@/lib/datetime";
import { formatPhone, maskPhoneInput } from "@/lib/phone";
import { db } from "@/server/db";
import { recentAuditFor } from "@/server/queries/panel";
import { buildGateView } from "@/server/services/gate-view";
import { getEventConfig, getStockOverview } from "@/server/services/settings";
import { loadPersonState } from "@/server/services/state";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Participante" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ParticipantDetailPage({ params }: PageProps<"/painel/participantes/[id]">) {
  const actor = await requirePageActor("viewParticipants");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [state, config, stock] = await Promise.all([loadPersonState(db, id), getEventConfig(db), getStockOverview(db)]);
  if (!state) notFound();
  const view = buildGateView(state, actor.access, config, new Date(), stock);
  const person = state.person;
  // Histórico da pessoa, da inscrição dela e, para funcionários, do cadastro de funcionário (convidado incluído).
  const entityIds = [person.id, state.ownRegistration?.id, state.employee?.id].filter((v): v is string => Boolean(v));
  const history = await recentAuditFor(entityIds, 40);
  const fullCpf = can(actor.access, "viewFullCpf");
  const groupId = state.ownRegistration?.id ?? state.guestOf?.host.id;
  // Colaborador(a) do SINDSERM tem cadastro próprio (categoria e setor), sem matrícula nem lotação de filiado.
  const employee = state.employee;
  const kind = employee ? "employee" : state.ownRegistration ? "member" : "guest";

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="-ml-2">
        <Link href="/painel/participantes">
          <ArrowLeft /> Participantes
        </Link>
      </Button>
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
              ) : can(actor.access, "manageGuests") ? (
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
              {employee ? (
                <>
                  <div className="col-span-2 flex flex-wrap items-center gap-2">
                    <CategoryChip category={employee.category} />
                    <span className="text-sm font-semibold text-fg">{employee.jobTitle ?? "Setor não informado"}</span>
                  </div>
                </>
              ) : (
                <>
                  {kind === "member" ? (
                    <>
                      <Info label="Matrícula" value={person.registrationNumber ?? "—"} />
                      <Info label="Lotação" value={person.workplace ?? "—"} />
                    </>
                  ) : null}
                  <Info label="Menor de 18" value={person.isMinor ? "Sim" : "Não"} />
                </>
              )}
              <Info label="Cadastrado em" value={formatDateTime(person.createdAt)} />
            </dl>
            {groupId ? (
              <Button asChild variant="secondary" className="mt-4 w-full">
                <Link href={`/painel/inscricoes/${groupId}`}>
                  <List /> Abrir inscrição do grupo
                </Link>
              </Button>
            ) : null}
          </Panel>
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
