"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { cachedPreview, DocumentSlot } from "@/components/documents/document-slot";
import { FormField } from "@/components/forms/form-field";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import { HelpLine } from "@/components/help/help";
import { ClipboardNote, Gift, Lock, Pencil } from "@/components/icons/pixel";
import { PlayerTag } from "@/components/retro/bits";
import { CassetteProgress } from "@/components/retro/cassette";
import { ScrollHint } from "@/components/retro/scroll-hint";
import { Input } from "@/components/ui/input";
import { AUTHORIZATION_ACCEPT_LABEL, authorizationText, nextMonthValue } from "@/domain/affiliation-text";
import {
  guestNameClash,
  type PreAffiliationData,
  type PreAffiliationInput,
  preAffiliationSchema,
  SAME_NAME_GUEST_MESSAGE,
} from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { formatCpf, normalizeCpf } from "@/lib/cpf";
import { formatPlainDate } from "@/lib/datetime";
import type { DocumentKind } from "@/domain/types";
import { formatPhone } from "@/lib/phone";
import { playSound } from "@/lib/sound";
import { uuidv4 } from "@/lib/uuid";
import { submitPublicPreAffiliation } from "@/server/actions/registration";
import { ContributionMonthField } from "./contribution-month";
import {
  Callout,
  ConsentBox,
  GuestFields,
  PrivacyNotice,
  ReviewBlock,
  ReviewItem,
  StepFrame,
  StepHeader,
  TeacherQuestion,
  validateGuestStep,
  WizardNav,
} from "./wizard-parts";

type Step = "personal" | "work" | "authorization" | "guest" | "documents" | "review";

const PERSONAL_FIELDS = [
  "ficha.fullName",
  "ficha.cpf",
  "ficha.birthDate",
  "ficha.rg",
  "ficha.motherName",
  "ficha.fatherName",
  "ficha.whatsapp",
  "ficha.email",
] as const;
const WORK_FIELDS = [
  "ficha.address",
  "ficha.addressNumber",
  "ficha.neighborhood",
  "ficha.workplace",
  "ficha.registrationNumber",
  "ficha.jobTitle",
  "ficha.admissionDate",
  "isTeacher",
] as const;

function fileCount(total: number | undefined) {
  if (!total) return "Falta enviar";
  return total === 1 ? "1 arquivo" : `${total} arquivos`;
}

/**
 * Ficha de filiação preenchida antes da festa (mesmos campos da ficha em
 * papel), com a cópia do RG e do contracheque. Na recepção, falta apenas
 * assinar a autorização de desconto.
 */
export function FichaWizard({ onExit, today }: { onExit: () => void; today: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("personal");
  const [direction, setDirection] = useState(1);
  const [pending, startTransition] = useTransition();
  const [submissionId] = useState(() => uuidv4());

  const form = useForm<PreAffiliationInput, unknown, PreAffiliationData>({
    resolver: zodResolver(preAffiliationSchema),
    mode: "onTouched",
    defaultValues: {
      submissionId,
      ficha: {
        fullName: "",
        motherName: "",
        fatherName: "",
        address: "",
        addressNumber: "",
        neighborhood: "",
        email: "",
        whatsapp: "",
        birthDate: "",
        rg: "",
        cpf: "",
        workplace: "",
        registrationNumber: "",
        jobTitle: "",
        admissionDate: "",
        contributionStartMonth: nextMonthValue(today),
      },
      isTeacher: null as unknown as boolean,
      guest: null,
      authorizationAccepted: false,
      documents: { rg: [], payslip: [] },
      privacyConsent: false,
    },
  });
  const { control, register, formState, trigger, handleSubmit, setError, setValue, clearErrors } = form;
  const errors = formState.errors;
  const fe = errors.ficha;
  const values = useWatch({ control });
  const [uploading, setUploading] = useState<Record<DocumentKind, boolean>>({ RG: false, PAYSLIP: false });
  const isTeacher = values.isTeacher === true;
  const flow: Step[] = isTeacher
    ? ["personal", "work", "authorization", "guest", "documents", "review"]
    : ["personal", "work", "authorization", "documents", "review"];
  const index = Math.max(0, flow.indexOf(step));
  const names: Record<Step, string> = {
    personal: "Você",
    work: "Trabalho",
    authorization: "Desconto",
    guest: "Player 2",
    documents: "Docs",
    review: "Confirmar",
  };

  function go(next: Step) {
    setDirection(flow.indexOf(next) >= index ? 1 : -1);
    playSound("blip");
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Valida os campos da etapa; se faltar algo, avisa com som (a mensagem aparece no campo). */
  async function check(fields: Parameters<typeof trigger>[0]) {
    const ok = await trigger(fields, { shouldFocus: true });
    if (!ok) playSound("warn");
    return ok;
  }

  async function next() {
    if (step === "personal") {
      if (await check([...PERSONAL_FIELDS])) go("work");
    } else if (step === "work") {
      if (!(await check([...WORK_FIELDS]))) return;
      if (!isTeacher && values.guest) setValue("guest", null);
      go("authorization");
    } else if (step === "authorization") {
      if (await check(["ficha.contributionStartMonth", "authorizationAccepted"])) {
        go(isTeacher ? "guest" : "documents");
      }
    } else if (step === "guest") {
      if (!(await validateGuestStep(values.guest, trigger))) return;
      if (guestNameClash(values.guest, values.ficha?.fullName)) {
        setError("guest.cpf", { type: "manual", message: SAME_NAME_GUEST_MESSAGE }, { shouldFocus: true });
        playSound("warn");
        return;
      }
      go("documents");
    } else if (step === "documents") {
      if (uploading.RG || uploading.PAYSLIP) {
        playSound("warn");
        toast.info("Espere o envio dos arquivos terminar.");
        return;
      }
      if (await check(["documents.rg", "documents.payslip"])) go("review");
    }
  }

  function back() {
    if (index > 0) go(flow[index - 1]!);
    else onExit();
  }

  function stepForError(path: string): Step {
    if ((PERSONAL_FIELDS as readonly string[]).includes(path)) return "personal";
    if ((WORK_FIELDS as readonly string[]).includes(path)) return "work";
    if (path.startsWith("guest")) return "guest";
    if (path.startsWith("authorization") || path.startsWith("ficha.contribution")) return "authorization";
    if (path.startsWith("documents")) return "documents";
    return "review";
  }

  function showServerErrors(error: string, fieldErrors: Record<string, string> = {}) {
    toast.error(error);
    const entries = Object.entries(fieldErrors);
    for (const [path, message] of entries) setError(path as FieldPath<PreAffiliationInput>, { type: "server", message });
    if (entries.length) go(stepForError(entries[0]![0]));
  }

  const onValid = () => {
    startTransition(async () => {
      // O servidor revalida e normaliza: envia os valores no formato de entrada.
      const result = await callAction(submitPublicPreAffiliation(form.getValues()));
      if (result.ok) router.push(`/vouchers/${result.data.accessToken}?nova=1`);
      else showServerErrors(result.error, result.fieldErrors);
    });
  };

  const onInvalid = (invalid: typeof errors) => {
    const paths = Object.keys(invalid.ficha ?? {}).map((k) => `ficha.${k}`);
    if (invalid.isTeacher) paths.push("isTeacher");
    if (invalid.guest) paths.push("guest");
    if (invalid.authorizationAccepted) paths.push("authorizationAccepted");
    if (invalid.documents) paths.push("documents");
    const target = paths.length ? stepForError(paths[0]!) : "review";
    if (target !== step) go(target);
    playSound("error");
    toast.error("Revise os campos destacados.");
  };

  const f = values.ficha;
  const guest = values.guest;

  return (
    <form onSubmit={handleSubmit(onValid, onInvalid)} noValidate className="mx-auto max-w-2xl">
      <CassetteProgress step={index} steps={flow.map((s) => names[s])} label="LADO B" />

      <div className="mt-6 rounded-2xl border border-line bg-surface/95 p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] backdrop-blur sm:p-7">
        <StepFrame stepKey={step} direction={direction}>
          {step === "personal" ? (
            <>
              <StepHeader
                title="Ficha de filiação"
                subtitle="Os mesmos dados da ficha em papel do SINDSERM. Na recepção você só assina."
              />
              <Callout tone="red" icon={Gift} testId="ficha-kit-notice">
                Qualquer servidor(a) municipal pode se filiar e vir à festa. <strong>O kit de consumação (e o convidado) é só
                para professoras e professores.</strong>
              </Callout>
              <FormField id="f-name" label="Nome completo" error={fe?.fullName?.message}>
                <Input id="f-name" autoComplete="name" aria-invalid={Boolean(fe?.fullName)} {...register("ficha.fullName")} />
              </FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="f-cpf" label="CPF" error={fe?.cpf?.message}>
                  <Controller control={control} name="ficha.cpf" render={({ field }) => <CpfInput id="f-cpf" aria-invalid={Boolean(fe?.cpf)} {...field} />} />
                </FormField>
                <FormField id="f-rg" label="RG" error={fe?.rg?.message}>
                  <Input id="f-rg" autoComplete="off" aria-invalid={Boolean(fe?.rg)} {...register("ficha.rg")} />
                </FormField>
              </div>
              <FormField id="f-birth" label="Data de nascimento" error={fe?.birthDate?.message}>
                <Input id="f-birth" type="date" aria-invalid={Boolean(fe?.birthDate)} {...register("ficha.birthDate")} />
              </FormField>
              <FormField id="f-mother" label="Nome da mãe" error={fe?.motherName?.message}>
                <Input id="f-mother" autoComplete="off" aria-invalid={Boolean(fe?.motherName)} {...register("ficha.motherName")} />
              </FormField>
              <FormField id="f-father" label="Nome do pai" optional error={fe?.fatherName?.message}>
                <Input id="f-father" autoComplete="off" aria-invalid={Boolean(fe?.fatherName)} {...register("ficha.fatherName")} />
              </FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="f-whatsapp" label="WhatsApp" error={fe?.whatsapp?.message}>
                  <Controller
                    control={control}
                    name="ficha.whatsapp"
                    render={({ field }) => <PhoneInput id="f-whatsapp" aria-invalid={Boolean(fe?.whatsapp)} {...field} />}
                  />
                </FormField>
                <FormField id="f-email" label="E-mail" optional error={fe?.email?.message}>
                  <Input id="f-email" type="email" autoComplete="email" aria-invalid={Boolean(fe?.email)} {...register("ficha.email")} />
                </FormField>
              </div>
            </>
          ) : null}

          {step === "work" ? (
            <>
              <StepHeader title="Endereço e trabalho" subtitle="Matrícula da prefeitura e CPF são únicos: não podem estar em outra ficha." />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <FormField id="f-address" label="Endereço" error={fe?.address?.message}>
                  <Input id="f-address" autoComplete="street-address" aria-invalid={Boolean(fe?.address)} {...register("ficha.address")} />
                </FormField>
                <FormField id="f-number" label="Número" error={fe?.addressNumber?.message}>
                  <Input id="f-number" inputMode="numeric" aria-invalid={Boolean(fe?.addressNumber)} {...register("ficha.addressNumber")} />
                </FormField>
              </div>
              <FormField id="f-neighborhood" label="Bairro" error={fe?.neighborhood?.message}>
                <Input id="f-neighborhood" aria-invalid={Boolean(fe?.neighborhood)} {...register("ficha.neighborhood")} />
              </FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="f-workplace" label="Lotação (onde trabalha)" error={fe?.workplace?.message}>
                  <Input
                    id="f-workplace"
                    autoComplete="organization"
                    placeholder="Ex.: Escola Municipal X, Secretaria de Saúde"
                    aria-invalid={Boolean(fe?.workplace)}
                    {...register("ficha.workplace")}
                  />
                </FormField>
                <FormField id="f-registration" label="Matrícula da prefeitura" error={fe?.registrationNumber?.message}>
                  <Input id="f-registration" aria-invalid={Boolean(fe?.registrationNumber)} {...register("ficha.registrationNumber")} />
                </FormField>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="f-job" label="Cargo / função" error={fe?.jobTitle?.message}>
                  <Input id="f-job" aria-invalid={Boolean(fe?.jobTitle)} {...register("ficha.jobTitle")} />
                </FormField>
                <FormField id="f-admission" label="Data de admissão" error={fe?.admissionDate?.message}>
                  <Input id="f-admission" type="date" aria-invalid={Boolean(fe?.admissionDate)} {...register("ficha.admissionDate")} />
                </FormField>
              </div>
              <Controller
                control={control}
                name="isTeacher"
                render={({ field }) => <TeacherQuestion value={field.value} onChange={field.onChange} error={errors.isTeacher?.message} />}
              />
            </>
          ) : null}

          {step === "authorization" ? (
            <>
              <StepHeader
                title="Autorização de desconto"
                subtitle="O texto é o mesmo da ficha impressa. Você confirma aqui e assina o papel na recepção."
              />
              <FormField
                id="f-month"
                label="A partir do mês / ano"
                error={fe?.contributionStartMonth?.message}
                description="Mês em que o desconto de 1% começa a ser feito."
              >
                <Controller
                  control={control}
                  name="ficha.contributionStartMonth"
                  render={({ field }) => (
                    <ContributionMonthField
                      id="f-month"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={Boolean(fe?.contributionStartMonth)}
                      baseYear={Number(today.slice(0, 4))}
                    />
                  )}
                />
              </FormField>
              <blockquote className="relative rounded-xl border-l-4 border-red bg-paper p-4 text-[0.95rem] leading-relaxed font-semibold text-paper-ink">
                {authorizationText(f?.contributionStartMonth).toUpperCase()}
              </blockquote>
              <Controller
                control={control}
                name="authorizationAccepted"
                render={({ field }) => (
                  <ConsentBox
                    id="authorization"
                    checked={field.value}
                    onChange={field.onChange}
                    error={errors.authorizationAccepted?.message}
                    testId="authorization-accept"
                    icon={Pencil}
                  >
                    {AUTHORIZATION_ACCEPT_LABEL}
                  </ConsentBox>
                )}
              />
            </>
          ) : null}

          {step === "guest" ? (
            <>
              <StepHeader title="Seu Player 2" subtitle="Cada professor(a) pode levar um convidado. Ele recebe o próprio QR Code." />
              <Controller
                control={control}
                name="guest"
                render={({ field }) => (
                  <GuestFields
                    value={field.value}
                    onChange={field.onChange}
                    errors={errors.guest}
                    onFieldEdit={(key) => clearErrors(key === "fullName" ? ["guest.fullName", "guest.cpf"] : `guest.${key}`)}
                  />
                )}
              />
            </>
          ) : null}

          {step === "documents" ? (
            <>
              <StepHeader
                title="Documentos"
                subtitle="Para confirmar a filiação, o SINDSERM precisa da cópia do RG e do contracheque. Dá para tirar a foto agora mesmo."
              />
              {(["RG", "PAYSLIP"] as const).map((kind) => {
                const name = kind === "RG" ? "documents.rg" : "documents.payslip";
                const kindErrors = errors.documents?.[kind === "RG" ? "rg" : "payslip"];
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
                        onUploaded={(doc) => {
                          field.onChange([...(form.getValues(name) ?? []), doc.id]);
                          clearErrors(name);
                        }}
                        onRemove={(id) => field.onChange((form.getValues(name) ?? []).filter((value) => value !== id))}
                        error={kindErrors?.message ?? kindErrors?.root?.message}
                        onBusyChange={(busy) => setUploading((current) => ({ ...current, [kind]: busy }))}
                        testId={kind === "RG" ? "doc-rg" : "doc-payslip"}
                      />
                    )}
                  />
                );
              })}
              <Callout tone="info" icon={Lock}>
                Os arquivos ficam guardados com criptografia e só a equipe do SINDSERM vê. Eles servem só para conferir e registrar
                a sua filiação.
              </Callout>
              <HelpLine topic="enviar os documentos da ficha de filiação" />
            </>
          ) : null}

          {step === "review" ? (
            <>
              <StepHeader title="Confira sua ficha" subtitle="Depois de gravar, seus vouchers aparecem na hora." />
              <ReviewBlock title="Você" onEdit={() => go("personal")} tag={<PlayerTag player={1} />}>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <ReviewItem label="Nome" value={f?.fullName} />
                  <ReviewItem label="CPF" value={formatCpf(normalizeCpf(f?.cpf ?? ""))} />
                  <ReviewItem label="RG" value={f?.rg} />
                  <ReviewItem label="Nascimento" value={formatPlainDate(f?.birthDate)} />
                  <ReviewItem label="Mãe" value={f?.motherName} />
                  <ReviewItem label="Pai" value={f?.fatherName} />
                  <ReviewItem label="WhatsApp" value={formatPhone(f?.whatsapp)} />
                  <ReviewItem label="E-mail" value={f?.email} />
                </dl>
              </ReviewBlock>
              <ReviewBlock title="Trabalho" onEdit={() => go("work")}>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <ReviewItem label="Endereço" value={[f?.address, f?.addressNumber].filter(Boolean).join(", ")} />
                  <ReviewItem label="Bairro" value={f?.neighborhood} />
                  <ReviewItem label="Lotação" value={f?.workplace} />
                  <ReviewItem label="Matrícula" value={f?.registrationNumber} />
                  <ReviewItem label="Cargo / função" value={f?.jobTitle} />
                  <ReviewItem label="Admissão" value={formatPlainDate(f?.admissionDate)} />
                  <ReviewItem label="Professor(a)" value={isTeacher ? "Sim" : "Não"} />
                </dl>
              </ReviewBlock>
              {isTeacher ? (
                <ReviewBlock title="Convidado" onEdit={() => go("guest")} tag={guest ? <PlayerTag player={2} /> : null}>
                  {guest ? (
                    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                      <ReviewItem label="Nome" value={guest.fullName} />
                      <ReviewItem label="CPF" value={guest.cpf ? formatCpf(normalizeCpf(guest.cpf)) : "Não informado"} />
                      {guest.isMinor ? <ReviewItem label="Idade" value="Menor de 18 anos" /> : null}
                    </dl>
                  ) : (
                    <p className="text-sm text-fg-muted">Sem convidado.</p>
                  )}
                </ReviewBlock>
              ) : null}

              <ReviewBlock title="Documentos" onEdit={() => go("documents")}>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <ReviewItem label="RG" value={fileCount(values.documents?.rg?.length)} />
                  <ReviewItem label="Contracheque" value={fileCount(values.documents?.payslip?.length)} />
                </dl>
              </ReviewBlock>

              <Callout tone="red" icon={ClipboardNote} testId="signature-summary">
                <strong className="font-bold">Na recepção:</strong> apresente o seu QR Code, confira a ficha impressa e assine
                a autorização de desconto. Depois disso a entrada é liberada
                {isTeacher ? " e o seu kit sai junto." : "."}
              </Callout>
              {isTeacher ? (
                <Callout tone="info" icon={Gift}>
                  Como professor(a) filiado(a), você terá 1 kit de consumação
                  {guest ? " e mais 1 para o seu convidado" : ""}. Os kits são entregues na recepção
                  {guest ? ": o seu na sua entrada; o do convidado, depois que você chegar." : ", junto com a sua entrada."}
                </Callout>
              ) : null}

              <PrivacyNotice ficha />
              <Controller
                control={control}
                name="privacyConsent"
                render={({ field }) => (
                  <ConsentBox id="privacy-consent" checked={field.value} onChange={field.onChange} error={errors.privacyConsent?.message} testId="privacy-consent">
                    Li o aviso de privacidade e concordo com o uso dos meus dados para a filiação e para a festa. O meu convidado
                    (ou o responsável, se menor) autorizou o envio dos dados dele.
                  </ConsentBox>
                )}
              />
            </>
          ) : null}
        </StepFrame>
      </div>

      {step === "review" ? <ScrollHint targetId="privacy-consent" label="Falta o aceite" className="bottom-28 sm:bottom-6" /> : null}
      {step === "authorization" ? <ScrollHint targetId="authorization" label="Falta o aceite" className="bottom-28 sm:bottom-6" /> : null}
      <WizardNav canGoBack onBack={back} onNext={next} isLast={step === "review"} pending={pending} submitLabel="Gravar ficha" />
    </form>
  );
}
