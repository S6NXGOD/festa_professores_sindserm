"use client";

import { type UseFormReturn, useWatch } from "react-hook-form";
import { BrandLockup } from "@/components/brand/brand";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EventSettingsData, EventSettingsInput } from "@/domain/schemas";
import { formatClock } from "@/lib/datetime";

export type EventForm = UseFormReturn<EventSettingsInput, unknown, EventSettingsData>;

export function EventDetailsFields({ form }: { form: EventForm }) {
  const { register, formState } = form;
  const e = formState.errors;
  const name = useWatch({ control: form.control, name: "name" });
  return (
    <div className="space-y-5">
      <FormField
        id="event-name"
        label="Nome do evento"
        description="Aparece no topo do site, na aba do navegador, na prévia do link no WhatsApp, nos vouchers e nas mensagens. Com um traço entre espaços ( – ), o que vem depois dele vira a chamada em vermelho."
        error={e.name?.message}
      >
        <Input id="event-name" placeholder="Ex.: Festa das Professoras e Professores – SINDSERMTHE 2026" {...register("name")} />
      </FormField>
      {name?.trim() ? (
        <div className="-mt-2 rounded-xl border border-dashed border-line-strong bg-ink/60 px-3 py-2.5" data-testid="event-name-preview">
          <p className="pixel mb-2 text-[0.45rem] text-fg-dim">Assim fica no topo do site</p>
          <BrandLockup name={name} kicker="SINDSERM" wrap />
        </div>
      ) : null}
      <FormField id="event-description" label="Descrição" optional error={e.description?.message}>
        <Textarea id="event-description" rows={4} placeholder="Atrações, traje, orientações..." {...register("description")} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-3">
        <FormField id="event-date" label="Data" error={e.eventDate?.message}>
          <Input id="event-date" type="date" {...register("eventDate")} />
        </FormField>
        <FormField id="event-start" label="Início" error={e.startTime?.message}>
          <Input id="event-start" type="time" {...register("startTime")} />
        </FormField>
        <FormField id="event-end" label="Término" optional error={e.endTime?.message}>
          <Input id="event-end" type="time" {...register("endTime")} />
        </FormField>
      </div>
    </div>
  );
}

export function RegistrationPeriodFields({ form, timeZone }: { form: EventForm; timeZone: string }) {
  const { register, formState } = form;
  const e = formState.errors;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="reg-opens" label="Abertura das inscrições" error={e.registrationOpensAt?.message}>
          <Input id="reg-opens" type="datetime-local" {...register("registrationOpensAt")} />
        </FormField>
        <FormField id="reg-closes" label="Encerramento das inscrições" error={e.registrationClosesAt?.message}>
          <Input id="reg-closes" type="datetime-local" {...register("registrationClosesAt")} />
        </FormField>
      </div>
      <p className="text-xs text-fg-dim">
        Horários no fuso {timeZone}. Fora deste período o formulário público fica fechado; o Atendimento continua podendo
        cadastrar pessoas na hora.
      </p>
    </div>
  );
}

/** Horário limite para entregar kits no dia da festa. */
export function KitDeadlineField({ form }: { form: EventForm }) {
  const { register, formState, control } = form;
  const [deadline, start] = useWatch({ control, name: ["kitDeadlineTime", "startTime"] });
  const crossesMidnight = Boolean(deadline && start && deadline < start);
  return (
    <FormField
      id="kit-deadline"
      label="Horário limite para entregar kits"
      optional
      error={formState.errors.kitDeadlineTime?.message}
      description={
        deadline
          ? `Quem entrar depois das ${formatClock(deadline)}${crossesMidnight ? " (madrugada seguinte)" : ""} entra sem kit. Deixe vazio para não ter limite.`
          : "Deixe vazio para não ter limite. Horário antes do início vale para a madrugada seguinte (ex.: 01:00)."
      }
    >
      <Input id="kit-deadline" type="time" className="sm:max-w-48" {...register("kitDeadlineTime")} />
    </FormField>
  );
}
