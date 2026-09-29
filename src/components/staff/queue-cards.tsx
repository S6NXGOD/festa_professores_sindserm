import Link from "next/link";
import { DocumentThumbs } from "@/components/documents/document-thumbs";
import { Check, Phone, Users } from "@/components/icons/pixel";
import { WhatsAppButton } from "@/components/staff/whatsapp-button";
import { PixelTag } from "@/components/retro/bits";
import { AffiliationDecisionButtons, SignatureButtons } from "@/components/staff/affiliation-decision-buttons";
import { TeacherBadge } from "@/components/status/status-badge";
import { formatCpf } from "@/lib/cpf";
import { formatShortDateTime } from "@/lib/datetime";
import { registrationWhatsappMessage } from "@/domain/whatsapp-messages";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { AffiliationFormRow, VerificationRow } from "@/server/queries/panel";

/*
 * Cartões das filas de trabalho do Atendimento: tudo o que é preciso para
 * decidir sem abrir outra tela, com a ação ali mesmo.
 */

function Field({ label, children, mono = false, wide = false }: { label: string; children: React.ReactNode; mono?: boolean; wide?: boolean }) {
  return (
    <div className={cn(wide && "col-span-2")}>
      <dt className="text-xs text-fg-dim">{label}</dt>
      <dd className={cn("font-semibold text-fg", mono && "font-mono")}>{children}</dd>
    </div>
  );
}

/** Inscrição para conferir: os dados para bater com o cadastro do sindicato e a decisão. */
export function VerificationCard({ row, canDecide, eventName }: { row: VerificationRow; canDecide: boolean; eventName: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5" data-testid="queue-item">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/painel/participantes/${row.personId}`} className="display text-2xl text-fg hover:text-red">
              {row.fullName}
            </Link>
            <TeacherBadge isTeacher={row.isTeacher} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Field label="CPF" mono>
              {formatCpf(row.cpf)}
            </Field>
            <Field label="Matrícula">{row.registrationNumber ?? "—"}</Field>
            <Field label="Lotação" wide>
              {row.workplace ?? "—"}
            </Field>
          </dl>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
            {row.whatsapp ? (
              <WhatsAppButton
                phone={row.whatsapp}
                name={row.fullName}
                label={formatPhone(row.whatsapp)}
                message={registrationWhatsappMessage({ fullName: row.fullName, status: "PENDING", eventName })}
                className="h-8 px-2.5 text-xs"
                testId="queue-whatsapp"
              />
            ) : (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> Sem WhatsApp
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" /> {row.guestName ? `Convidado: ${row.guestName}` : "Sem convidado"}
            </span>
            <span>Inscrito {formatShortDateTime(row.createdAt)}</span>
            {row.origin === "STAFF" ? <span>Cadastrado pela equipe</span> : null}
          </p>
        </div>
        {canDecide ? <AffiliationDecisionButtons registrationId={row.registrationId} name={row.fullName} isTeacher={row.isTeacher} /> : null}
      </div>
    </div>
  );
}


/** Ficha esperando a assinatura na recepção: conferir, imprimir e confirmar. */
export function SignatureCard({ row, eventName }: { row: AffiliationFormRow; eventName: string }) {
  const missingDocuments = !row.hasRg || !row.hasPayslip;
  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5" data-testid="signature-item">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/painel/filiacoes/${row.id}`} className="display text-2xl text-fg hover:text-red">
              {row.fullName}
            </Link>
            <TeacherBadge isTeacher={row.isTeacher} />
            <PixelTag tone="neutral">{row.origin === "PUBLIC" ? "Site" : "Atendimento"}</PixelTag>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Field label="CPF" mono>
              {formatCpf(row.cpf)}
            </Field>
            <Field label="Matrícula">{row.registrationNumber || "—"}</Field>
            <Field label="Cargo · lotação" wide>
              {[row.jobTitle, row.workplace].filter(Boolean).join(" · ") || "—"}
            </Field>
          </dl>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            {row.whatsapp ? (
              <WhatsAppButton
                phone={row.whatsapp}
                name={row.fullName}
                label={formatPhone(row.whatsapp)}
                message={registrationWhatsappMessage({ fullName: row.fullName, status: "AWAITING_SIGNATURE", eventName })}
                className="h-8 px-2.5 text-xs"
                testId="signature-whatsapp"
              />
            ) : (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> Sem WhatsApp
              </span>
            )}
            {row.registrationId ? (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> {row.guestName ? `Convidado: ${row.guestName}` : "Sem convidado"}
              </span>
            ) : null}
            <span>
              {row.origin === "PUBLIC" ? "Preenchida no site" : `Registrada por ${row.createdBy ?? "equipe"}`} {formatShortDateTime(row.createdAt)}
            </span>
          </p>
          {/* Miniaturas: dá para ver de relance o que foi anexado (e abrir tocando). */}
          <DocumentThumbs documents={row.documents} testId="signature-documents" />
          {row.hasSignedForm ? (
            <p className="inline-flex items-center gap-1.5 rounded-md border border-[#38bdf8]/50 bg-[#0ea5e9]/10 px-2 py-1 text-xs font-bold text-[#7dd3fc]" data-testid="signature-govbr">
              <Check className="size-3.5" /> Assinada no gov.br: confira e confirme
            </p>
          ) : null}
        </div>
        <SignatureButtons formId={row.id} name={row.fullName} missingDocuments={missingDocuments} govbr={row.hasSignedForm} />
      </div>
    </div>
  );
}
