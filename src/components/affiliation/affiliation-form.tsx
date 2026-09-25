"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { cachedPreview, DocumentSlot } from "@/components/documents/document-slot";
import { FormField } from "@/components/forms/form-field";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import { Camera, Loader, Pencil, Save } from "@/components/icons/pixel";
import { ContributionMonthField } from "@/components/registration/contribution-month";
import { ConsentBox, TeacherQuestion } from "@/components/registration/wizard-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAFF_AUTHORIZATION_ACCEPT_LABEL, authorizationText } from "@/domain/affiliation-text";
import { type AffiliationFormData, type AffiliationFormInput, affiliationFormSchema } from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { saveAffiliationFormAction } from "@/server/actions/affiliation-forms";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <legend className="sr-only">{title}</legend>
      <h2 className="display mb-4 text-2xl text-fg">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Ficha de filiação (mesmos campos da ficha do SINDSERM). Salva como rascunho até a assinatura. */
export function AffiliationFormEditor({
  initial,
  formId,
  cpfLocked,
}: {
  initial: AffiliationFormInput;
  formId?: string;
  cpfLocked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState({ RG: false, PAYSLIP: false });
  const form = useForm<AffiliationFormInput, unknown, AffiliationFormData>({
    resolver: zodResolver(affiliationFormSchema),
    mode: "onTouched",
    defaultValues: formId ? initial : { ...initial, documents: initial.documents ?? { rg: [], payslip: [] } },
  });
  const { register, control, formState, setError, handleSubmit } = form;
  const e = formState.errors;
  const month = useWatch({ control, name: "contributionStartMonth" });

  const submit = handleSubmit(
    () => {
      if (uploading.RG || uploading.PAYSLIP) {
        toast.info("Espere o envio das fotos terminar.");
        return;
      }
      startTransition(async () => {
        // O servidor revalida e normaliza; envia os valores no formato de entrada.
        const result = await callAction(saveAffiliationFormAction(form.getValues(), formId ?? null));
        if (!result.ok) {
          toast.error(result.error);
          for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
            setError(path as FieldPath<AffiliationFormInput>, { message });
          }
          return;
        }
        toast.success("Ficha salva. Imprima para assinatura e confirme quando estiver assinada.");
        router.push(`/painel/filiacoes/${result.data.formId}`);
        router.refresh();
      });
    },
    () => toast.error("Revise os campos destacados."),
  );

  const text = (
    name: FieldPath<AffiliationFormInput>,
    label: string,
    options: { optional?: boolean; type?: string; className?: string; autoComplete?: string } = {},
  ) => (
    <FormField
      id={`ficha-${name}`}
      label={label}
      optional={options.optional}
      error={(e as Record<string, { message?: string }>)[name]?.message}
      className={options.className}
    >
      <Input id={`ficha-${name}`} type={options.type ?? "text"} autoComplete={options.autoComplete ?? "off"} {...register(name)} />
    </FormField>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Group title="Dados pessoais">
        {text("fullName", "Nome", { className: "sm:col-span-2" })}
        {text("motherName", "Nome da mãe")}
        {text("fatherName", "Nome do pai", { optional: true })}
        {text("birthDate", "Data de nascimento", { type: "date" })}
        {text("rg", "RG")}
        <FormField id="ficha-cpf" label="CPF" error={e.cpf?.message}>
          <Controller control={control} name="cpf" render={({ field }) => <CpfInput id="ficha-cpf" disabled={cpfLocked} {...field} />} />
        </FormField>
      </Group>

      <Group title="Endereço e contato">
        {text("address", "Endereço", { className: "sm:col-span-2" })}
        {text("addressNumber", "Número")}
        {text("neighborhood", "Bairro")}
        {text("email", "E-mail", { optional: true, type: "email" })}
        <FormField id="ficha-whatsapp" label="WhatsApp" error={e.whatsapp?.message}>
          <Controller control={control} name="whatsapp" render={({ field }) => <PhoneInput id="ficha-whatsapp" {...field} />} />
        </FormField>
      </Group>

      <Group title="Dados funcionais">
        {text("workplace", "Lotação", { className: "sm:col-span-2" })}
        {text("registrationNumber", "Matrícula da prefeitura")}
        {text("jobTitle", "Cargo / função")}
        {text("admissionDate", "Data de admissão", { type: "date" })}
        {text("formDate", "Data da ficha", { type: "date" })}
        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="isTeacher"
            render={({ field }) => <TeacherQuestion value={field.value} onChange={field.onChange} error={e.isTeacher?.message} subject="A pessoa" />}
          />
        </div>
      </Group>

      {!formId ? (
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="display mb-1 flex items-center gap-2 text-2xl text-fg">
            <Camera className="size-5 text-red" /> Documentos
          </h2>
          <p className="mb-4 text-sm text-fg-muted">
            Tire a foto do RG e do contracheque agora (ou depois, na tela da ficha). Sem os dois, a assinatura não é confirmada.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["RG", "PAYSLIP"] as const).map((kind) => {
              const name = kind === "RG" ? "documents.rg" : "documents.payslip";
              return (
                <Controller
                  key={kind}
                  control={control}
                  name={name}
                  render={({ field }) => (
                    <DocumentSlot
                      kind={kind}
                      items={(field.value ?? []).map((id) => ({
                        id,
                        thumbUrl: cachedPreview(id)?.url ?? null,
                        isPdf: cachedPreview(id)?.isPdf ?? false,
                      }))}
                      // Lê o valor atual na hora: várias fotos escolhidas de uma vez chegam uma após a outra.
                      onUploaded={(doc) => field.onChange([...(form.getValues(name) ?? []), doc.id])}
                      onRemove={(id) => field.onChange((form.getValues(name) ?? []).filter((value) => value !== id))}
                      onBusyChange={(busy) => setUploading((current) => ({ ...current, [kind]: busy }))}
                      testId={kind === "RG" ? "staff-doc-rg" : "staff-doc-payslip"}
                    />
                  )}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="display mb-4 flex items-center gap-2 text-2xl text-fg">
          <Pencil className="size-5 text-red" /> Autorização de desconto
        </h2>
        <FormField id="ficha-month" label="A partir do mês / ano" error={e.contributionStartMonth?.message}>
          <Controller
            control={control}
            name="contributionStartMonth"
            render={({ field }) => (
              <ContributionMonthField id="ficha-month" value={field.value} onChange={field.onChange} baseYear={Number(initial.formDate.slice(0, 4))} />
            )}
          />
        </FormField>
        <blockquote className="mt-4 rounded-xl border-l-4 border-red bg-paper p-4 text-sm leading-relaxed font-semibold text-paper-ink">
          {authorizationText(month).toUpperCase()}
        </blockquote>
        <div className="mt-4">
          <Controller
            control={control}
            name="authorizationAccepted"
            render={({ field }) => (
              <ConsentBox id="ficha-authorization" checked={field.value} onChange={field.onChange} error={e.authorizationAccepted?.message} icon={Pencil}>
                {STAFF_AUTHORIZATION_ACCEPT_LABEL}
              </ConsentBox>
            )}
          />
        </div>
        <p className="mt-3 text-xs text-fg-dim">
          O aceite no sistema não substitui a assinatura: imprima a ficha, colha a assinatura e depois confirme.
        </p>
      </section>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} data-testid="save-affiliation-form">
          {pending ? <Loader className="animate-spin-steps" /> : <Save />} Salvar ficha
        </Button>
      </div>
    </form>
  );
}
