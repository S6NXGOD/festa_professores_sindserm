import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AffiliationFormEditor } from "@/components/affiliation/affiliation-form";
import { ArrowLeft, Warning } from "@/components/icons/pixel";
import { PageHeader } from "@/components/staff/panel-ui";
import { Button } from "@/components/ui/button";
import { nextMonthValue } from "@/domain/affiliation-text";
import { isActiveMember } from "@/domain/rules";
import type { AffiliationFormInput } from "@/domain/schemas";
import { formatCpf } from "@/lib/cpf";
import { todayInZone } from "@/lib/datetime";
import { maskPhoneInput } from "@/lib/phone";
import { db } from "@/server/db";
import { loadPersonState } from "@/server/services/state";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Nova ficha de filiação" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewAffiliationPage({ searchParams }: PageProps<"/painel/filiacoes/nova">) {
  await requirePageActor("newAffiliation");
  const query = await searchParams;
  const personId = typeof query.pessoa === "string" && UUID.test(query.pessoa) ? query.pessoa : null;
  const state = personId ? await loadPersonState(db, personId) : null;

  if (state?.openAffiliationForm) redirect(`/painel/filiacoes/${state.openAffiliationForm.id}`);
  const alreadyMember = state?.ownRegistration && isActiveMember(state.ownRegistration.status);
  const today = todayInZone();

  const initial: AffiliationFormInput = {
    personId: state ? state.person.id : null,
    formDate: today,
    fullName: state?.person.fullName ?? "",
    motherName: "",
    fatherName: "",
    address: "",
    addressNumber: "",
    neighborhood: "",
    email: "",
    whatsapp: state?.person.whatsapp ? maskPhoneInput(state.person.whatsapp) : "",
    birthDate: "",
    rg: "",
    cpf: state ? formatCpf(state.person.cpf) : "",
    workplace: state?.person.workplace ?? "",
    registrationNumber: state?.person.registrationNumber ?? "",
    jobTitle: "",
    admissionDate: "",
    contributionStartMonth: nextMonthValue(today),
    isTeacher: (state?.ownRegistration?.isTeacher ?? null) as unknown as boolean,
    authorizationAccepted: false,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" className="-ml-2 mb-2">
        <Link href={state ? `/painel/participantes/${state.person.id}` : "/painel/filiacoes"}>
          <ArrowLeft /> Voltar
        </Link>
      </Button>
      <PageHeader
        eyebrow="Atendimento"
        title="Ficha de filiação"
        description={
          state
            ? `Ficha para ${state.person.fullName}${
                state.guestOf
                  ? ` (hoje convidado(a) de ${state.guestOf.host.member.fullName})`
                  : state.guestOfEmployee
                    ? ` (hoje convidado(a) de ${state.guestOfEmployee.host.person.fullName}, funcionário(a) do SINDSERM)`
                    : ""
              }.`
            : "Mesmos campos da ficha em papel do SINDSERM. Se o CPF já existir no sistema, a pessoa é reaproveitada."
        }
      />
      {alreadyMember ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm font-semibold text-fg">
          <Warning className="mt-0.5 size-5 shrink-0 text-warning" /> Esta pessoa já é filiada confirmada; não precisa de nova ficha.
        </div>
      ) : (
        // Convidado cadastrado sem CPF: a ficha pede o CPF (ele passa a valer no cadastro).
        <AffiliationFormEditor initial={initial} cpfLocked={Boolean(state?.person.cpf)} />
      )}
    </div>
  );
}
