"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import { Gift, Heart, Loader, Warning } from "@/components/icons/pixel";
import { CourtesyRightsNote, InviterField, KitChoice, MinorCheckbox } from "@/components/staff/employee-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type GateCourtesyData, type GateCourtesyInput, gateCourtesySchema } from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { plural } from "@/lib/plural";
import { playSound } from "@/lib/sound";
import { firstName } from "@/lib/text";
import { cn } from "@/lib/utils";
import { createCourtesyAtGateAction } from "@/server/actions/employees";

/** Entrada de cada bloco, um depois do outro (a tela "monta" rápido, sem pular). */
const block = (index: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.05 * index, duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
});

/**
 * Cortesia feita na hora, na portaria: nome, quem convidou e com ou sem kit. Ao
 * gravar, a tela da pessoa abre para confirmar a entrada (o kit sai junto, do
 * estoque dos colaboradores).
 */
export function QuickCourtesyForm({
  initialName,
  initialCpf,
  inviters,
  employeeStock,
}: {
  initialName: string;
  initialCpf: string;
  inviters: string[];
  /** Kits que ainda restam no estoque dos colaboradores (null: estoque não usado). */
  employeeStock: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<GateCourtesyInput, unknown, GateCourtesyData>({
    resolver: zodResolver(gateCourtesySchema),
    mode: "onTouched",
    defaultValues: { fullName: initialName, cpf: initialCpf, whatsapp: "", jobTitle: "", isMinor: false, withKit: true },
  });
  const { control, register, setError } = form;
  const errors = form.formState.errors;
  const withKit = useWatch({ control, name: "withKit" }) !== false;
  const noStock = employeeStock !== null && employeeStock <= 0;

  const onValid = () => {
    // Envia o que foi digitado: o servidor valida e normaliza de novo.
    const data = form.getValues();
    startTransition(async () => {
      const result = await callAction(createCourtesyAtGateAction(data));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(path as FieldPath<GateCourtesyInput>, { type: "server", message });
        }
        return;
      }
      playSound("powerup");
      toast.success(`${firstName(data.fullName)} na lista como cortesia! Agora é só confirmar a entrada.`);
      router.push(`/portaria/pessoa/${result.data.personId}`);
    });
  };

  const onInvalid = () => {
    playSound("error");
    toast.error("Revise os campos destacados.");
  };

  return (
    <form onSubmit={form.handleSubmit(onValid, onInvalid)} noValidate className="space-y-4" data-testid="quick-courtesy">
      <motion.section {...block(0)} className="space-y-4 rounded-2xl border border-[#ff4fb4]/40 bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="pixel inline-flex items-center gap-1.5 rounded-md bg-[#ff4fb4] px-2 py-1 text-[0.5rem] text-ink">
            <Heart className="size-3.5" /> Cortesia
          </span>
          <span className="pixel text-[0.5rem] text-fg-dim">Da organização</span>
        </div>
        <FormField id="gate-courtesy-name" label="Nome completo" error={errors.fullName?.message}>
          <Input
            id="gate-courtesy-name"
            autoComplete="off"
            autoFocus={!initialName}
            aria-invalid={Boolean(errors.fullName)}
            data-testid="gate-courtesy-name"
            {...register("fullName")}
          />
        </FormField>
        <InviterField
          id="gate-courtesy-inviter"
          error={errors.jobTitle?.message}
          register={register("jobTitle")}
          inviters={inviters}
          description="Aparece no voucher e agrupa a lista de cortesias."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="gate-courtesy-cpf" label="CPF" optional error={errors.cpf?.message}>
            <Controller
              control={control}
              name="cpf"
              render={({ field }) => <CpfInput id="gate-courtesy-cpf" aria-invalid={Boolean(errors.cpf)} data-testid="gate-courtesy-cpf" {...field} />}
            />
          </FormField>
          <FormField id="gate-courtesy-whatsapp" label="WhatsApp" optional error={errors.whatsapp?.message}>
            <Controller
              control={control}
              name="whatsapp"
              render={({ field }) => <PhoneInput id="gate-courtesy-whatsapp" aria-invalid={Boolean(errors.whatsapp)} {...field} />}
            />
          </FormField>
        </div>
        <Controller control={control} name="isMinor" render={({ field }) => <MinorCheckbox checked={Boolean(field.value)} onChange={field.onChange} />} />
      </motion.section>

      <motion.section {...block(1)} className="space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <Controller control={control} name="withKit" render={({ field }) => <KitChoice value={field.value !== false} onChange={field.onChange} />} />
        {withKit && employeeStock !== null ? (
          <p
            className={cn("flex items-center gap-2 text-xs font-semibold", noStock ? "text-warning" : "text-fg-muted")}
            data-testid="gate-courtesy-stock"
          >
            {noStock ? <Warning className="size-4 shrink-0" /> : <Gift className="size-4 shrink-0 text-[#ff8fd0]" />}
            {noStock
              ? "Estoque dos colaboradores zerado: a cortesia entra sem kit até alguém repor."
              : `Estoque dos colaboradores: ${plural(employeeStock, "kit", "kits")} agora.`}
          </p>
        ) : null}
        <CourtesyRightsNote withKit={withKit} />
      </motion.section>

      {/* Como a barra de confirmar entrada: o botão da vez fica no pé da tela, sem precisar rolar. */}
      <div className="safe-bottom no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 px-3 pt-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button type="submit" size="xl" className="w-full" disabled={pending} data-testid="gate-courtesy-submit">
            {pending ? <Loader className="animate-spin-steps" /> : <Heart />} Cadastrar cortesia
          </Button>
        </div>
      </div>
    </form>
  );
}
