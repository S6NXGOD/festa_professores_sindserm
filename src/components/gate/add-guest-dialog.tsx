"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, type FieldPath, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { CpfInput } from "@/components/forms/masked-input";
import { Gift, Loader, Repeat, UserPlus } from "@/components/icons/pixel";
import { PlayerTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type AddGuestData, type AddGuestInput, addGuestSchema } from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import { addGuestAction } from "@/server/actions/operations";

/** Cadastro (ou troca) do convidado — o Player 2 — de um(a) professor(a) ou de um(a) funcionário(a) do SINDSERM. */
export function AddGuestDialog({
  host,
  holderName,
  replace,
  onDone,
}: {
  /** Quem convida: a inscrição do(a) professor(a) ou o(a) funcionário(a). */
  host: { registrationId?: string; employeeId?: string };
  holderName: string;
  /** Convidado atual, quando a ação é de troca. */
  replace?: { guestLinkId: string; fullName: string } | null;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaults: AddGuestInput = {
    registrationId: host.registrationId ?? null,
    employeeId: host.employeeId ?? null,
    fullName: "",
    cpf: "",
    isMinor: false,
    replaceGuestLinkId: replace?.guestLinkId ?? null,
  };
  const form = useForm<AddGuestInput, unknown, AddGuestData>({ resolver: zodResolver(addGuestSchema), defaultValues: defaults });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(() => {
    startTransition(async () => {
      const result = await callAction(addGuestAction(form.getValues()));
      if (!result.ok) {
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(path as FieldPath<AddGuestInput>, { message });
        }
        return;
      }
      playSound("powerup");
      toast.success(
        result.data.replaced
          ? `Convidado trocado: agora é ${result.data.name}.`
          : result.data.reusedPerson
            ? `${result.data.name} (já cadastrado) agora é convidado(a).`
            : `${result.data.name} entrou como Player 2.`,
      );
      form.reset(defaults);
      setOpen(false);
      onDone?.();
    });
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        {replace ? (
          <Button type="button" variant="outline" size="sm" data-testid="open-replace-guest">
            <Repeat /> Trocar
          </Button>
        ) : (
          <Button type="button" variant="outline" data-testid="open-add-guest">
            <UserPlus /> Cadastrar convidado
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <DialogHeader>
            <PlayerTag player={2} className="w-fit" />
            <DialogTitle>{replace ? "Trocar convidado" : "Cadastrar convidado"}</DialogTitle>
            <DialogDescription>
              {replace
                ? `${replace.fullName} deixa de ser convidado(a) de ${holderName} e o QR dele(a) é cancelado.`
                : `Convidado(a) de ${holderName}. Se o CPF informado já existir, a pessoa é reaproveitada.`}
            </DialogDescription>
          </DialogHeader>
          <FormField id="new-guest-name" label="Nome completo" error={errors.fullName?.message}>
            <Input id="new-guest-name" {...form.register("fullName")} data-testid="add-guest-name" />
          </FormField>
          <FormField
            id="new-guest-cpf"
            label="CPF"
            optional
            description="Sem CPF (ex.: criança)? Deixe em branco: o QR Code identifica a pessoa."
            error={errors.cpf?.message}
          >
            <Controller
              control={form.control}
              name="cpf"
              render={({ field }) => <CpfInput id="new-guest-cpf" {...field} data-testid="add-guest-cpf" />}
            />
          </FormField>
          <Controller
            control={form.control}
            name="isMinor"
            render={({ field }) => (
              <label className="flex items-center gap-3 text-sm font-semibold text-fg">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                Menor de 18 anos
              </label>
            )}
          />
          <p className="flex items-start gap-2 rounded-lg border border-red/40 bg-brand-soft p-3 text-sm text-fg">
            <Gift className="mt-0.5 size-4 shrink-0 text-red" />
            O convidado tem direito ao kit de consumação: sai na recepção depois que {holderName} chegar.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} data-testid="submit-add-guest">
              {pending ? <Loader className="animate-spin-steps" /> : replace ? <Repeat /> : <UserPlus />}
              {replace ? "Trocar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
