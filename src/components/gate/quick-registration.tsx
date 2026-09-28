"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import { Info, Loader, UserPlus } from "@/components/icons/pixel";
import { Callout, ConsentBox, GuestFields, TeacherQuestion } from "@/components/registration/wizard-parts";
import { PlayerTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type RegistrationData, type RegistrationInput, registrationSchema } from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import { firstName } from "@/lib/text";
import { uuidv4 } from "@/lib/uuid";
import { submitGateRegistration } from "@/server/actions/registration";

/** Entrada de cada bloco, um depois do outro (a tela "monta" rápido, sem pular). */
const block = (index: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.05 * index, duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
});

/**
 * Cadastro rápido na portaria: quem chegou sem inscrição (e já é filiado(a)) entra
 * na lista numa tela só — a mesma inscrição do "Cadastrar na hora", aguardando
 * conferência — e a tela da pessoa abre direto na conferência da filiação.
 */
export function QuickRegistrationForm({ initialName, initialCpf }: { initialName: string; initialCpf: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submissionId] = useState(() => uuidv4());
  const form = useForm<RegistrationInput, unknown, RegistrationData>({
    resolver: zodResolver(registrationSchema),
    mode: "onTouched",
    defaultValues: {
      submissionId,
      member: { fullName: initialName, cpf: initialCpf, whatsapp: "", registrationNumber: "", workplace: "" },
      // Sem resposta até a equipe escolher.
      isTeacher: null as unknown as boolean,
      guest: null,
      privacyConsent: false,
    },
  });
  const { control, register, setError, setValue, clearErrors } = form;
  const errors = form.formState.errors;
  const isTeacher = useWatch({ control, name: "isTeacher" }) === true;

  const onValid = () => {
    // Envia o que foi digitado: o servidor valida e normaliza de novo.
    const data = form.getValues();
    startTransition(async () => {
      const result = await callAction(submitGateRegistration(data));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(path as FieldPath<RegistrationInput>, { type: "server", message });
        }
        return;
      }
      playSound("powerup");
      toast.success(`${firstName(data.member.fullName)} na lista! Agora confira a filiação.`);
      router.push(`/portaria/pessoa/${result.data.personId}#person-operations`);
    });
  };

  const onInvalid = () => {
    playSound("error");
    toast.error("Revise os campos destacados.");
  };

  return (
    <form onSubmit={form.handleSubmit(onValid, onInvalid)} noValidate className="space-y-4" data-testid="quick-registration">
      <motion.section {...block(0)} className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <PlayerTag player={1} />
          <span className="pixel text-[0.5rem] text-fg-dim">Filiado(a)</span>
        </div>
        <FormField id="quick-name" label="Nome completo" error={errors.member?.fullName?.message}>
          <Input
            id="quick-name"
            autoComplete="off"
            autoFocus={!initialName}
            aria-invalid={Boolean(errors.member?.fullName)}
            data-testid="quick-name"
            {...register("member.fullName")}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="quick-cpf" label="CPF" error={errors.member?.cpf?.message}>
            <Controller
              control={control}
              name="member.cpf"
              render={({ field }) => (
                <CpfInput id="quick-cpf" autoFocus={Boolean(initialName) && !initialCpf} aria-invalid={Boolean(errors.member?.cpf)} data-testid="quick-cpf" {...field} />
              )}
            />
          </FormField>
          <FormField id="quick-whatsapp" label="WhatsApp" error={errors.member?.whatsapp?.message}>
            <Controller
              control={control}
              name="member.whatsapp"
              render={({ field }) => (
                <PhoneInput id="quick-whatsapp" aria-invalid={Boolean(errors.member?.whatsapp)} data-testid="quick-whatsapp" {...field} />
              )}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <FormField id="quick-registration" label="Matrícula da prefeitura" error={errors.member?.registrationNumber?.message}>
            <Input
              id="quick-registration"
              autoComplete="off"
              aria-invalid={Boolean(errors.member?.registrationNumber)}
              data-testid="quick-registration-number"
              {...register("member.registrationNumber")}
            />
          </FormField>
          <FormField id="quick-workplace" label="Lotação (onde trabalha)" error={errors.member?.workplace?.message}>
            <Input
              id="quick-workplace"
              autoComplete="off"
              placeholder="Ex.: Escola Municipal X"
              aria-invalid={Boolean(errors.member?.workplace)}
              data-testid="quick-workplace"
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
              onChange={(value) => {
                field.onChange(value);
                // Não é professor(a): não leva convidado.
                if (!value) setValue("guest", null);
              }}
              error={errors.isTeacher?.message}
              subject="A pessoa"
            />
          )}
        />
      </motion.section>

      {isTeacher ? (
        <motion.section {...block(0)} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <p className="mb-3 text-[0.78rem] font-bold tracking-[0.08em] text-fg-muted uppercase">Convidado(a)</p>
          <Controller
            control={control}
            name="guest"
            render={({ field }) => (
              <GuestFields
                value={field.value}
                onChange={field.onChange}
                errors={errors.guest}
                onFieldEdit={(key) => clearErrors(key === "fullName" ? ["guest.fullName", "guest.cpf"] : `guest.${key}`)}
                voice="gate"
              />
            )}
          />
        </motion.section>
      ) : null}

      <motion.div {...block(1)} className="space-y-4">
        <Callout tone="warning" icon={Info}>
          Entra como <strong>aguardando conferência</strong>. Ao gravar, a tela da pessoa abre na conferência: confira a filiação
          (contracheque ou lista do SINDSERM) e registre a entrada.
        </Callout>
        <Controller
          control={control}
          name="privacyConsent"
          render={({ field }) => (
            <ConsentBox id="quick-consent" checked={field.value} onChange={field.onChange} error={errors.privacyConsent?.message} testId="quick-consent">
              A pessoa foi informada do aviso de privacidade e concorda com o uso dos dados para a festa (com autorização do convidado e, se
              menor, do responsável).
            </ConsentBox>
          )}
        />
      </motion.div>

      {/* Como a barra de confirmar entrada: o botão da vez fica no pé da tela, sem precisar rolar. */}
      <div className="safe-bottom no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 px-3 pt-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button type="submit" size="xl" className="w-full" disabled={pending} data-testid="quick-submit">
            {pending ? <Loader className="animate-spin-steps" /> : <UserPlus />} Cadastrar e conferir
          </Button>
        </div>
      </div>
    </form>
  );
}
