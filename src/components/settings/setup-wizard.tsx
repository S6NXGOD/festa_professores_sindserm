"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader, Play } from "@/components/icons/pixel";
import { StepFrame, StepHeader } from "@/components/registration/wizard-parts";
import { CassetteProgress } from "@/components/retro/cassette";
import { Button } from "@/components/ui/button";
import { STOCK_MODE_LABEL } from "@/domain/labels";
import {
  type EventSettingsData,
  type EventSettingsInput,
  eventSettingsSchema,
  type StockSettingsData,
  type StockSettingsInput,
  stockSettingsSchema,
} from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { formatClock, formatPlainDateLong } from "@/lib/datetime";
import { completeSetupAction } from "@/server/actions/setup";
import { EventDetailsFields, KitDeadlineField, RegistrationPeriodFields } from "./event-settings-fields";
import { StockFields } from "./stock-settings-fields";

const STEPS = ["Evento", "Inscrições", "Kits", "Revisão"];
const DRAFT_KEY = "festa-setup-draft";

export function SetupWizard({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [pending, startTransition] = useTransition();

  const eventForm = useForm<EventSettingsInput, unknown, EventSettingsData>({
    resolver: zodResolver(eventSettingsSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      description: "",
      eventDate: "",
      startTime: "",
      endTime: "",
      registrationOpensAt: "",
      registrationClosesAt: "",
      kitDeadlineTime: "",
    },
  });
  const stockForm = useForm<StockSettingsInput, unknown, StockSettingsData>({
    resolver: zodResolver(stockSettingsSchema),
    mode: "onTouched",
    defaultValues: { stockMode: "SINGLE", totalAll: "", totalMember: "", totalGuest: "", totalEmployee: "", lowStockThreshold: "" },
  });

  // Rascunho local (somente dados do evento, sem dados pessoais).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { event?: EventSettingsInput; stock?: StockSettingsInput };
      if (draft.event) eventForm.reset({ ...eventForm.getValues(), ...draft.event });
      if (draft.stock) stockForm.reset({ ...stockForm.getValues(), ...draft.stock });
    } catch {
      // rascunho inválido: ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega uma única vez
  }, []);
  const eventValues = useWatch({ control: eventForm.control });
  const stockValues = useWatch({ control: stockForm.control });
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ event: eventValues, stock: stockValues }));
    } catch {
      // armazenamento indisponível
    }
  }, [eventValues, stockValues]);

  // Sugere o alerta de estoque baixo (10%) enquanto o campo não foi editado.
  useEffect(() => {
    if (stockForm.getFieldState("lowStockThreshold").isDirty) return;
    const total =
      stockValues.stockMode === "SINGLE"
        ? Number(stockValues.totalAll || 0)
        : Math.min(Number(stockValues.totalMember || 0), Number(stockValues.totalGuest || 0));
    if (total > 0) stockForm.setValue("lowStockThreshold", String(Math.ceil(total * 0.1)));
  }, [stockValues.stockMode, stockValues.totalAll, stockValues.totalMember, stockValues.totalGuest, stockForm]);

  function go(next: number) {
    setDirection(next >= step ? 1 : -1);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function next() {
    let ok = true;
    if (step === 0) ok = await eventForm.trigger(["name", "description", "eventDate", "startTime", "endTime"], { shouldFocus: true });
    if (step === 1) ok = await eventForm.trigger(["registrationOpensAt", "registrationClosesAt"], { shouldFocus: true });
    if (step === 2) {
      const [stockOk, deadlineOk] = await Promise.all([
        stockForm.trigger(undefined, { shouldFocus: true }),
        eventForm.trigger("kitDeadlineTime", { shouldFocus: true }),
      ]);
      ok = stockOk && deadlineOk;
    }
    if (ok) go(Math.min(step + 1, STEPS.length - 1));
  }

  function finish() {
    startTransition(async () => {
      const eventOk = await eventForm.trigger();
      const stockOk = await stockForm.trigger();
      if (!eventOk || !stockOk) {
        toast.error("Revise os dados destacados.");
        go(eventOk ? 2 : 0);
        return;
      }
      const result = await callAction(completeSetupAction({ event: eventForm.getValues(), stock: stockForm.getValues() }));
      if (!result.ok) {
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          if (path.startsWith("event.")) eventForm.setError(path.slice(6) as FieldPath<EventSettingsInput>, { message });
          if (path.startsWith("stock.")) stockForm.setError(path.slice(6) as FieldPath<StockSettingsInput>, { message });
        }
        return;
      }
      window.localStorage.removeItem(DRAFT_KEY);
      toast.success("Festa configurada! O formulário público já segue o período definido.");
      router.replace("/painel");
      router.refresh();
    });
  }

  const e = eventValues;
  const s = stockValues;

  return (
    <div className="mx-auto max-w-3xl">
      <CassetteProgress step={step} steps={STEPS} label="SETUP" />
      <div className="mt-6 rounded-2xl border border-line bg-surface/95 p-5 backdrop-blur sm:p-7">
        <StepFrame stepKey={String(step)} direction={direction}>
          {step === 0 ? (
            <>
              <StepHeader title="Sobre a festa" subtitle="Aparece na página pública e nos vouchers." />
              <EventDetailsFields form={eventForm} />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <StepHeader title="Período de inscrições" subtitle="Quando o formulário público fica aberto." />
              <RegistrationPeriodFields form={eventForm} timeZone={timeZone} />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <StepHeader
                title="Kits de consumação"
                subtitle="O estoque só diminui quando uma entrega é confirmada e nunca fica negativo."
              />
              <StockFields form={stockForm} />
              <KitDeadlineField form={eventForm} />
            </>
          ) : null}
          {step === 3 ? (
            <>
              <StepHeader title="Tudo certo?" subtitle="Tudo pode ser alterado depois nas configurações." />
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Summary label="Festa" value={e.name} />
                <Summary
                  label="Data e horário"
                  value={`${formatPlainDateLong(e.eventDate ?? "")} · ${formatClock(e.startTime)}${e.endTime ? ` às ${formatClock(e.endTime)}` : ""}`}
                />
                <Summary
                  label="Inscrições"
                  value={`${(e.registrationOpensAt ?? "").replace("T", " ")} até ${(e.registrationClosesAt ?? "").replace("T", " ")}`}
                />
                <Summary label="Estoque" value={STOCK_MODE_LABEL[s.stockMode ?? "SINGLE"]} />
                <Summary
                  label="Quantidade"
                  value={
                    s.stockMode === "SINGLE"
                      ? `${String(s.totalAll ?? "")} kits`
                      : `${String(s.totalMember ?? "")} de professor(a) · ${String(s.totalGuest ?? "")} de convidado`
                  }
                />
                <Summary label="Kits entregues até" value={e.kitDeadlineTime ? formatClock(e.kitDeadlineTime) : "Sem limite"} />
                <Summary label="Alerta de estoque baixo" value={`Até ${String(s.lowStockThreshold ?? "")} kits`} />
              </dl>
            </>
          ) : null}
        </StepFrame>
      </div>
      <div className="mt-6 flex gap-3">
        {step > 0 ? (
          <Button type="button" variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => go(step - 1)} disabled={pending}>
            <ArrowLeft /> Voltar
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button key="next" type="button" size="lg" className="flex-[2]" onClick={next} data-testid="setup-next">
            Continuar <ArrowRight />
          </Button>
        ) : (
          <Button key="finish" type="button" size="lg" className="flex-[2]" onClick={finish} disabled={pending} data-testid="finish-setup">
            {pending ? <Loader className="animate-spin-steps" /> : <Play />} Soltar o som
          </Button>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <dt className="text-[0.7rem] font-bold tracking-[0.08em] text-fg-dim uppercase">{label}</dt>
      <dd className="mt-1 font-semibold break-words text-fg">{value || "—"}</dd>
    </div>
  );
}
