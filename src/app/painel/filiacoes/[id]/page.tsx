import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AffiliationFormEditor } from "@/components/affiliation/affiliation-form";
import { FormalizeController } from "@/components/affiliation/formalize-actions";
import { FormDocuments } from "@/components/documents/form-documents";
import { ArrowLeft, ClipboardNote, Lock, Printer, User } from "@/components/icons/pixel";
import { PageHeader, Panel } from "@/components/staff/panel-ui";
import { TeacherBadge, ToneBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { formatCpf } from "@/lib/cpf";
import { formatDateTime, formatMonthYear, formatPlainDate } from "@/lib/datetime";
import { formatPhone, maskPhoneInput } from "@/lib/phone";
import { DOCUMENT_KIND_LABEL } from "@/domain/labels";
import { can } from "@/domain/rules";
import { db } from "@/server/db";
import { getAffiliationForm } from "@/server/queries/panel";
import { listFormDocuments } from "@/server/services/documents";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Ficha de filiação" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AffiliationFormPage({ params }: PageProps<"/painel/filiacoes/[id]">) {
  const actor = await requirePageActor("viewForms");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [data, documents] = await Promise.all([getAffiliationForm(id), listFormDocuments(db, id)]);
  if (!data) notFound();
  const { form } = data;
  const files = documents.map((doc) => ({ id: doc.id, kind: doc.kind, isPdf: doc.contentType === "application/pdf" }));
  const missing = (["RG", "PAYSLIP"] as const).filter((kind) => !files.some((file) => file.kind === kind));
  const documentsPanel = (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          Documentos
          {missing.length ? (
            <ToneBadge tone="warning">Falta: {missing.map((kind) => DOCUMENT_KIND_LABEL[kind]).join(" e ")}</ToneBadge>
          ) : (
            <ToneBadge tone="success">RG e contracheque</ToneBadge>
          )}
        </span>
      }
    >
      <p className="mb-3 flex items-start gap-2 text-sm text-fg-muted">
        <Lock className="mt-0.5 size-4 shrink-0 text-red" />
        Cópias guardadas com criptografia. Toque na miniatura para abrir. A assinatura só é confirmada com os dois documentos.
      </p>
      <FormDocuments
        formId={form.id}
        files={files}
        canRemove={form.status === "DRAFT" || can(actor.access, "adminCorrections")}
        disabled={form.status === "CANCELLED"}
      />
    </Panel>
  );
  const author = form.origin === "PUBLIC" ? "pelo(a) próprio(a) interessado(a), no site" : `por ${data.createdBy ?? "equipe"}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" className="-ml-2 mb-2">
        <Link href="/painel/filiacoes">
          <ArrowLeft /> Fichas de filiação
        </Link>
      </Button>
      <PageHeader
        title={form.fullName}
        eyebrow="Ficha de filiação"
        description={`Preenchida ${formatDateTime(form.createdAt)} ${author}.`}
        actions={
          form.status === "DRAFT" ? null : (
            <Button asChild variant="outline">
              <Link href={`/painel/filiacoes/${form.id}/imprimir`} target="_blank">
                <Printer /> Imprimir ficha
              </Link>
            </Button>
          )
        }
      />

      {/* Mesma posição em todos os status: preserva o diálogo de resultado após a assinatura. */}
      <FormalizeController formId={form.id} name={form.fullName} status={form.status} missingDocuments={missing} />

      {form.status === "DRAFT" ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-warning/40 bg-warning-soft p-4">
            <ToneBadge tone="warning" icon={ClipboardNote}>
              Para assinar
            </ToneBadge>
            <p className="mt-2 text-sm text-fg">
              1) Confira o RG e o contracheque · 2) Imprima a ficha · 3) Colha a assinatura · 4) Toque em “Assinatura colhida”.
            </p>
          </div>
          {documentsPanel}
          <AffiliationFormEditor
            formId={form.id}
            cpfLocked
            initial={{
              personId: form.personId,
              formDate: form.formDate,
              fullName: form.fullName,
              motherName: form.motherName,
              fatherName: form.fatherName ?? "",
              address: form.address,
              addressNumber: form.addressNumber,
              neighborhood: form.neighborhood,
              email: form.email ?? "",
              whatsapp: maskPhoneInput(form.whatsapp),
              birthDate: form.birthDate,
              rg: form.rg,
              cpf: formatCpf(form.cpf),
              workplace: form.workplace,
              registrationNumber: form.registrationNumber,
              jobTitle: form.jobTitle,
              admissionDate: form.admissionDate,
              contributionStartMonth: form.contributionStartMonth,
              isTeacher: form.isTeacher,
              authorizationAccepted: form.authorizationAccepted,
            }}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <Panel
            title={
              <span className="flex flex-wrap items-center gap-2">
                Situação
                {form.status === "FORMALIZED" ? <ToneBadge tone="success">Assinada</ToneBadge> : <ToneBadge tone="neutral">Cancelada</ToneBadge>}
              </span>
            }
            action={
              form.status === "FORMALIZED" ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/painel/participantes/${form.personId}`}>
                    <User /> Cadastro
                  </Link>
                </Button>
              ) : null
            }
          >
            <p className="text-sm text-fg-muted">
              {form.status === "FORMALIZED"
                ? `Assinatura registrada ${formatDateTime(form.formalizedAt)}${data.formalizedBy ? ` por ${data.formalizedBy}` : ""}.`
                : `Ficha cancelada ${formatDateTime(form.cancelledAt)}.`}
            </p>
          </Panel>
          {documentsPanel}
          <Panel title="Dados da ficha" action={<TeacherBadge isTeacher={form.isTeacher} />}>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                ["Data", formatPlainDate(form.formDate)],
                ["CPF", formatCpf(form.cpf)],
                ["Nome da mãe", form.motherName],
                ["Nome do pai", form.fatherName ?? "—"],
                ["Nascimento", formatPlainDate(form.birthDate)],
                ["RG", form.rg],
                ["Endereço", `${form.address}, ${form.addressNumber} — ${form.neighborhood}`],
                ["E-mail", form.email ?? "—"],
                ["WhatsApp", formatPhone(form.whatsapp)],
                ["Lotação", form.workplace],
                ["Matrícula", form.registrationNumber],
                ["Cargo/função", form.jobTitle],
                ["Admissão", formatPlainDate(form.admissionDate)],
                ["Desconto a partir de", formatMonthYear(form.contributionStartMonth)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-surface-2 p-3">
                  <dt className="text-[0.68rem] font-bold tracking-[0.08em] text-fg-dim uppercase">{label}</dt>
                  <dd className="font-semibold break-words text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      )}
    </div>
  );
}
