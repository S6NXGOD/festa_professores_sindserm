"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, type FieldPath, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { PhoneInput } from "@/components/forms/masked-input";
import { Loader, Save } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import {
  type EventSettingsData,
  type EventSettingsInput,
  eventSettingsSchema,
  type HelpSettingsData,
  type HelpSettingsInput,
  helpSettingsSchema,
  type StockSettingsData,
  type StockSettingsInput,
  stockSettingsSchema,
} from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { updateEventSettingsAction, updateHelpSettingsAction, updateStockSettingsAction } from "@/server/actions/setup";
import { EventDetailsFields, KitDeadlineField, RegistrationPeriodFields } from "./event-settings-fields";
import { StockFields } from "./stock-settings-fields";

export function EventSettingsForm({ initial, timeZone }: { initial: EventSettingsInput; timeZone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<EventSettingsInput, unknown, EventSettingsData>({
    resolver: zodResolver(eventSettingsSchema),
    mode: "onTouched",
    defaultValues: initial,
  });

  const submit = form.handleSubmit(
    () => {
      startTransition(async () => {
        const values = form.getValues();
        const result = await callAction(updateEventSettingsAction(values));
        if (!result.ok) {
          toast.error(result.error);
          for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
            form.setError(path as FieldPath<EventSettingsInput>, { message });
          }
          return;
        }
        toast.success("Configurações salvas.");
        form.reset(values);
        router.refresh();
      });
    },
    () => toast.error("Revise os campos destacados."),
  );

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <EventDetailsFields form={form} />
      <RegistrationPeriodFields form={form} timeZone={timeZone} />
      <KitDeadlineField form={form} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader className="animate-spin-steps" /> : <Save />} Salvar alterações
        </Button>
      </div>
    </form>
  );
}

/** WhatsApp da organização para dúvidas (botão de ajuda). */
export function HelpSettingsForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<HelpSettingsInput, unknown, HelpSettingsData>({
    resolver: zodResolver(helpSettingsSchema),
    mode: "onTouched",
    defaultValues: { helpWhatsapp: initial },
  });
  const e = form.formState.errors;

  const submit = form.handleSubmit(() => {
    startTransition(async () => {
      const values = form.getValues();
      const result = await callAction(updateHelpSettingsAction(values));
      if (!result.ok) {
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(path as FieldPath<HelpSettingsInput>, { message });
        }
        return;
      }
      toast.success(values.helpWhatsapp ? "WhatsApp de ajuda salvo." : "Botão de ajuda escondido.");
      form.reset(values);
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <FormField id="help-whatsapp" label="WhatsApp (com DDD)" optional error={e.helpWhatsapp?.message} className="flex-1">
        <Controller
          control={form.control}
          name="helpWhatsapp"
          render={({ field }) => <PhoneInput id="help-whatsapp" {...field} />}
        />
      </FormField>
      <Button type="submit" disabled={pending} data-testid="save-help">
        {pending ? <Loader className="animate-spin-steps" /> : <Save />} Salvar
      </Button>
    </form>
  );
}

export function StockSettingsForm({
  initial,
  delivered,
}: {
  initial: StockSettingsInput;
  delivered: { member: number; guest: number; employee: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<StockSettingsInput, unknown, StockSettingsData>({
    resolver: zodResolver(stockSettingsSchema),
    mode: "onTouched",
    defaultValues: initial,
  });

  const submit = form.handleSubmit(() => {
    startTransition(async () => {
      const result = await callAction(updateStockSettingsAction(form.getValues()));
      if (!result.ok) {
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(path as FieldPath<StockSettingsInput>, { message });
        }
        return;
      }
      toast.success("Estoque atualizado.");
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <StockFields form={form} delivered={delivered} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader className="animate-spin-steps" /> : <Save />} Salvar estoque
        </Button>
      </div>
    </form>
  );
}
