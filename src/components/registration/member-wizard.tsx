"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CpfTakenRecovery } from "@/components/voucher/recover-vouchers-form";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import { useEventName } from "@/components/help/help";
import { Gift, MemberCard, Printer, Warning } from "@/components/icons/pixel";
import { PixelTag, PlayerTag } from "@/components/retro/bits";
import { CassetteProgress } from "@/components/retro/cassette";
import { ScrollHint } from "@/components/retro/scroll-hint";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CopyLinkBox } from "@/components/voucher/copy-link-box";
import {
  guestNameClash,
  publicRegistrationSchema,
  type RegistrationData,
  type RegistrationInput,
  registrationSchema,
  SAME_NAME_GUEST_MESSAGE,
} from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { formatCpf, normalizeCpf } from "@/lib/cpf";
import { formatPhone } from "@/lib/phone";
import { playSound } from "@/lib/sound";
import { uuidv4 } from "@/lib/uuid";
import { submitPublicRegistration, submitStaffRegistration } from "@/server/actions/registration";
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
import { firstName } from "@/lib/text";
import { type KitSupply, kitOutlook, kitsSoldOut } from "@/domain/kit-supply";
import { KitsSoldOutBanner, KitWaitlistNotice } from "./kit-waitlist-notice";
import { EDITION, GAME, T } from "@/domain/edition";

type Step = "member" | "guest" | "review";

/** Inscrição de quem já é filiado(a): dados, convidado (só professoras e professores) e revisão. */
export function MemberWizard({
  mode,
  onExit,
  kitSupply = null,
}: {
  mode: "public" | "staff";
  onExit?: () => void;
  /** Kits que uma inscrição nova ainda garante (avisa quando acabaram). */
  kitSupply?: KitSupply | null;
}) {
  const router = useRouter();
  const eventName = useEventName();
  const [step, setStep] = useState<Step>("member");
  const [direction, setDirection] = useState(1);
  const [pending, startTransition] = useTransition();
  const [submissionId] = useState(() => uuidv4());
  const [staffResult, setStaffResult] = useState<{ registrationId: string; accessToken: string } | null>(null);

  const form = useForm<RegistrationInput, unknown, RegistrationData>({
    // No site, a declaração de filiação é obrigatória; na hora, quem cadastra avisa a pessoa.
    resolver: zodResolver(mode === "staff" ? registrationSchema : publicRegistrationSchema),
    mode: "onTouched",
    defaultValues: {
      submissionId,
      member: { fullName: "", cpf: "", whatsapp: "", registrationNumber: "", workplace: "" },
      // Sem resposta até a pessoa escolher.
      // Festa sem a pergunta (servidoras e servidores): todo filiado(a) tem kit e convidado.
      isTeacher: (EDITION.askTeacher ? null : true) as unknown as boolean,
      guest: null,
      privacyConsent: false,
      acceptKitWaitlist: false,
      memberDeclaration: false,
    },
  });
  const { control, register, formState, trigger, handleSubmit, setError, setValue, clearErrors } = form;
  const errors = formState.errors;
  const values = useWatch({ control });
  const isTeacher = values.isTeacher === true;
  const flow: Step[] = isTeacher ? ["member", "guest", "review"] : ["member", "review"];
  const index = Math.max(0, flow.indexOf(step));
  const staff = mode === "staff";
  // CPF recusado por já estar inscrito: no site, oferece abrir os vouchers (quase sempre é a própria pessoa).
  const [takenCpf, setTakenCpf] = useState<string | null>(null);
  // Kits esgotados (ou acabaram enquanto a pessoa preenchia): o kit entra na fila do kit.
  const [lateSellout, setLateSellout] = useState<string | null>(null);
  const outlook = kitOutlook(kitSupply, { teacher: isTeacher, guest: Boolean(values.guest) });
  const kitWaits = isTeacher && (Boolean(lateSellout) || outlook.member === "WAITLIST" || outlook.guest === "WAITLIST");

  function go(next: Step) {
    setDirection(flow.indexOf(next) >= index ? 1 : -1);
    playSound("blip");
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function next() {
    if (step === "member") {
      const ok = await trigger(["member", "isTeacher"], { shouldFocus: true });
      if (!ok) {
        playSound("warn");
        return;
      }
      // Deixou de ser professor(a): não pode levar convidado.
      if (!isTeacher && values.guest) setValue("guest", null);
      go(isTeacher ? "guest" : "review");
    } else if (step === "guest") {
      if (!(await validateGuestStep(values.guest, trigger))) return;
      if (guestNameClash(values.guest, values.member?.fullName)) {
        setError("guest.cpf", { type: "manual", message: SAME_NAME_GUEST_MESSAGE }, { shouldFocus: true });
        playSound("warn");
        return;
      }
      go("review");
    }
  }

  function back() {
    if (index > 0) go(flow[index - 1]!);
    else onExit?.();
  }

  function stepForError(path: string): Step {
    if (path.startsWith("member") || path.startsWith("isTeacher")) return "member";
    if (path.startsWith("guest")) return "guest";
    return "review";
  }

  function showServerErrors(error: string, fieldErrors: Record<string, string> = {}, code?: string) {
    if (!staff && code === "CPF_TAKEN" && fieldErrors["member.cpf"]) setTakenCpf(form.getValues("member.cpf"));
    if (code === "KIT_WAITLIST") {
      setLateSellout(error);
      playSound("warn");
    }
    toast.error(error);
    const entries = Object.entries(fieldErrors);
    for (const [path, message] of entries) setError(path as FieldPath<RegistrationInput>, { type: "server", message });
    if (entries.length) go(stepForError(entries[0]![0]));
  }

  const onValid = () => {
    // Envia os valores digitados: o servidor valida e normaliza de novo.
    const data = form.getValues();
    startTransition(async () => {
      if (staff) {
        const result = await callAction(submitStaffRegistration(data));
        if (result.ok) {
          playSound("fanfare");
          setStaffResult(result.data);
        }
        else showServerErrors(result.error, result.fieldErrors);
        return;
      }
      const result = await callAction(submitPublicRegistration(data));
      if (result.ok) router.push(`/vouchers/${result.data.accessToken}?nova=1`);
      else showServerErrors(result.error, result.fieldErrors, result.code);
    });
  };

  // Kit na fila: no site, a pessoa confirma que leu o aviso antes de gravar.
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!staff && kitWaits && !form.getValues("acceptKitWaitlist")) {
      event.preventDefault();
      setError("acceptKitWaitlist", { type: "manual", message: "Confirme que leu o aviso dos kits" });
      // O que mais falta (declaração e aceite) aparece junto, para não descobrir um por vez.
      void trigger(["memberDeclaration", "privacyConsent"]);
      playSound("warn");
      toast.error("Os kits acabaram: confirme que o kit entra na fila.");
      document.getElementById("kit-waitlist-consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    void handleSubmit(onValid, onInvalid)(event);
  };

  const onInvalid = (invalid: typeof errors) => {
    const first: Step = invalid.member || invalid.isTeacher ? "member" : invalid.guest ? "guest" : "review";
    if (first !== step) go(first);
    playSound("error");
    toast.error("Revise os campos destacados.");
  };

  const stepNames = isTeacher ? ["Seus dados", GAME.player2Name, "Confirmar"] : ["Seus dados", "Confirmar"];
  const guest = values.guest;

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-2xl">
      <CassetteProgress step={index} steps={staff ? stepNames.map((s) => (s === "Seus dados" ? "Dados" : s)) : stepNames} />

      <div className="mt-6 rounded-2xl border border-line bg-surface/95 p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] backdrop-blur sm:p-7">
        <StepFrame stepKey={step} direction={direction}>
          {step === "member" ? (
            <>
              <StepHeader
                title={staff ? "Dados do(a) filiado(a)" : "Seus dados"}
                subtitle={
                  staff
                    ? "Com estes dados o SINDSERM confirma a filiação. Cada CPF e cada matrícula só podem ser usados uma vez."
                    : "Com estes dados o SINDSERM confirma que você é filiado(a). Cada CPF e cada matrícula só podem ser usados uma vez."
                }
              />
              {kitsSoldOut(kitSupply) ? <KitsSoldOutBanner staff={staff} deadlineLabel={kitSupply?.reservedUntil?.passed ? null : (kitSupply?.reservedUntil?.label ?? null)} /> : null}
              <FormField id="member-name" label="Nome completo" error={errors.member?.fullName?.message}>
                <Input id="member-name" autoComplete="name" aria-invalid={Boolean(errors.member?.fullName)} {...register("member.fullName")} />
              </FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="member-cpf" label="CPF" error={errors.member?.cpf?.message}>
                  <Controller
                    control={control}
                    name="member.cpf"
                    render={({ field }) => <CpfInput id="member-cpf" aria-invalid={Boolean(errors.member?.cpf)} {...field} />}
                  />
                </FormField>
                <FormField id="member-whatsapp" label="WhatsApp" error={errors.member?.whatsapp?.message}>
                  <Controller
                    control={control}
                    name="member.whatsapp"
                    render={({ field }) => <PhoneInput id="member-whatsapp" aria-invalid={Boolean(errors.member?.whatsapp)} {...field} />}
                  />
                </FormField>
              </div>
              {takenCpf && values.member?.cpf === takenCpf ? (
                <CpfTakenRecovery cpf={takenCpf} whatsapp={values.member?.whatsapp ?? ""} />
              ) : null}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <FormField id="member-registration" label="Matrícula da prefeitura" error={errors.member?.registrationNumber?.message}>
                  <Input
                    id="member-registration"
                    autoComplete="off"
                    inputMode="text"
                    aria-invalid={Boolean(errors.member?.registrationNumber)}
                    {...register("member.registrationNumber")}
                  />
                </FormField>
                <FormField id="member-workplace" label="Lotação (onde trabalha)" error={errors.member?.workplace?.message}>
                  <Input
                    id="member-workplace"
                    autoComplete="organization"
                    placeholder={T.workplaceExample}
                    aria-invalid={Boolean(errors.member?.workplace)}
                    {...register("member.workplace")}
                  />
                </FormField>
              </div>
              <Controller
                control={control}
                name="isTeacher"
                render={({ field }) => (
                  <TeacherQuestion
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.isTeacher?.message}
                    subject={staff ? "A pessoa" : "Você"}
                  />
                )}
              />
            </>
          ) : null}

          {step === "guest" ? (
            <>
              <StepHeader
                title={staff ? `Convidado (${GAME.player2Name})` : `Seu ${GAME.player2Name}`}
                subtitle={`Cada ${T.person} pode levar um convidado. Ele recebe o próprio QR Code para entrar.`}
              />
              <Controller
                control={control}
                name="guest"
                render={({ field }) => (
                  <GuestFields
                    value={field.value}
                    onChange={field.onChange}
                    errors={errors.guest}
                    onFieldEdit={(key) => clearErrors(key === "fullName" ? ["guest.fullName", "guest.cpf"] : `guest.${key}`)}
                    voice={staff ? "staff" : "self"}
                  />
                )}
              />
            </>
          ) : null}

          {step === "review" ? (
            <>
              <StepHeader title="Confira e grave" subtitle="Está tudo certo? Depois de gravar, os vouchers aparecem na hora." />
              <ReviewBlock title={staff ? "Filiado(a)" : "Você"} onEdit={() => go("member")} tag={<PlayerTag player={1} />}>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <ReviewItem label="Nome" value={values.member?.fullName} />
                  <ReviewItem label="CPF" value={formatCpf(normalizeCpf(values.member?.cpf ?? ""))} />
                  <ReviewItem label="WhatsApp" value={formatPhone(values.member?.whatsapp)} />
                  <ReviewItem label="Matrícula" value={values.member?.registrationNumber} />
                  <ReviewItem label="Lotação" value={values.member?.workplace} />
                  {EDITION.askTeacher ? <ReviewItem label={T.Person} value={isTeacher ? "Sim" : "Não"} /> : null}
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
                    <p className="text-sm text-fg-muted">Sem convidado. Se mudar de ideia, dá para cadastrar no dia da festa.</p>
                  )}
                </ReviewBlock>
              ) : null}

              {kitWaits ? (
                <Controller
                  control={control}
                  name="acceptKitWaitlist"
                  render={({ field }) => (
                    <KitWaitlistNotice
                      outlook={outlook}
                      staff={staff}
                      guestName={guest?.fullName}
                      lateMessage={lateSellout}
                      reservedUntil={kitSupply?.reservedUntil ?? null}
                      consent={staff ? undefined : { checked: Boolean(field.value), onChange: field.onChange, error: errors.acceptKitWaitlist?.message }}
                    />
                  )}
                />
              ) : (
              <Callout tone="red" icon={Gift} testId="kit-summary">
                {isTeacher ? (
                  <>
                    <strong className="font-bold">Kits de consumação:</strong>{" "}
                    {guest ? (
                      <>
                        1 para {staff ? T.thePerson : "você"} e 1 para <strong>{guest.fullName || "o convidado"}</strong>, entregues
                        na recepção. O do convidado sai depois que {staff ? T.thePerson : "você"} chegar.
                      </>
                    ) : (
                      <>1 kit, entregue na recepção junto com a entrada.</>
                    )}
                    {kitSupply?.reservedUntil && !kitSupply.reservedUntil.passed ? (
                      <> {staff ? "O kit fica guardado" : "Chegue até as " + kitSupply.reservedUntil.label + ": até esse horário, o kit fica guardado"}{staff ? ` até as ${kitSupply.reservedUntil.label}` : ""}.</>
                    ) : null}
                  </>
                ) : (
                  <>Participação sem kit de consumação (exclusivo para {T.people}).</>
                )}
              </Callout>
              )}

              <Callout tone="warning" icon={Warning} testId="member-declaration-notice">
                <strong className="font-bold">Inscrição só para quem é filiado(a).</strong>{" "}
                {staff ? "O SINDSERM confere a filiação nos sistemas dele" : "O SINDSERM confere nos sistemas dele se você é filiado(a)"}: os
                vouchers já ficam prontos, mas a entrada só é liberada depois dessa confirmação.{" "}
                <strong className="font-bold">
                  {staff ? "Avise a pessoa: se" : "Se"} o SINDSERM constatar que {staff ? "ela não é filiada, ela" : "você não é filiado(a), você"} não
                  entra na festa{isTeacher ? " nem recebe o kit" : ""}, mesmo com o voucher na mão
                  {guest ? ` (e ${guest.fullName ? firstName(guest.fullName) : "o convidado"} também não entra)` : ""}.
                </strong>
              </Callout>

              {staff ? null : (
                <Controller
                  control={control}
                  name="memberDeclaration"
                  render={({ field }) => (
                    <ConsentBox
                      id="member-declaration"
                      checked={Boolean(field.value)}
                      onChange={field.onChange}
                      error={errors.memberDeclaration?.message}
                      testId="member-declaration"
                      icon={MemberCard}
                    >
                      <strong className="font-bold text-fg">Declaro que sou filiado(a) ao SINDSERM</strong> e que os meus dados são verdadeiros.
                      Sei que, se o SINDSERM constatar que não sou, não entro na festa{isTeacher ? " nem recebo o kit" : ""}.
                    </ConsentBox>
                  )}
                />
              )}

              <PrivacyNotice />
              <Controller
                control={control}
                name="privacyConsent"
                render={({ field }) => (
                  <ConsentBox
                    id="privacy-consent"
                    checked={field.value}
                    onChange={field.onChange}
                    error={errors.privacyConsent?.message}
                    testId="privacy-consent"
                  >
                    {staff
                      ? "A pessoa foi informada do aviso de privacidade e concorda com o uso dos dados para a festa (com autorização do convidado e, se menor, do responsável)."
                      : "Li o aviso de privacidade e concordo com o uso dos dados para a festa. O meu convidado (ou o responsável, se menor) autorizou o envio dos dados dele."}
                  </ConsentBox>
                )}
              />
            </>
          ) : null}
        </StepFrame>
      </div>

      {step === "review" ? (
        <ScrollHint
          targetId={!staff && !values.memberDeclaration ? "member-declaration" : "privacy-consent"}
          label={!staff && !values.memberDeclaration ? "Falta a declaração" : "Falta o aceite"}
          className="bottom-28 sm:bottom-6"
        />
      ) : null}
      <WizardNav
        canGoBack={index > 0 || Boolean(onExit)}
        onBack={back}
        onNext={next}
        isLast={step === "review"}
        pending={pending}
        submitLabel={staff ? "Gravar inscrição" : "Gravar inscrição"}
      />

      <Dialog
        open={Boolean(staffResult)}
        onOpenChange={(open) => {
          if (!open && staffResult) router.push(`/painel/inscricoes/${staffResult.registrationId}?nova=1`);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <PixelTag tone="red" className="w-fit animate-blink">
              {GAME.oneUp}
            </PixelTag>
            <DialogTitle>Inscrição gravada!</DialogTitle>
            <DialogDescription>
              Mande agora o link dos vouchers para {(values.member?.fullName ? firstName(values.member.fullName) : "") || "a pessoa"}. Ele só aparece desta vez
              (depois dá para gerar outro na inscrição).
            </DialogDescription>
          </DialogHeader>
          {staffResult ? (
            <CopyLinkBox
              path={`/vouchers/${staffResult.accessToken}`}
              label="Link dos vouchers"
              whatsapp={{
                phone: values.member?.whatsapp,
                text: `Olá! Aqui estão os vouchers da ${eventName} (${values.member?.fullName ?? ""}${guest?.fullName ? ` e ${guest.fullName}` : ""}). Mostre o QR Code na entrada:`,
              }}
            />
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {staffResult ? (
              <Button asChild variant="outline">
                <a href={`/painel/inscricoes/${staffResult.registrationId}/vouchers?imprimir=1`} target="_blank" rel="noopener">
                  <Printer /> Imprimir vouchers
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => staffResult && router.push(`/painel/inscricoes/${staffResult.registrationId}?nova=1`)}
              data-testid="open-created-registration"
            >
              Abrir inscrição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
