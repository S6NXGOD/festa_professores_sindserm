"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, type FieldPath, useForm } from "react-hook-form";
import { toast } from "sonner";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import { FormField } from "@/components/forms/form-field";
import { Loader, Pencil } from "@/components/icons/pixel";
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
import { type PersonCorrectionInput, personCorrectionSchema } from "@/domain/schemas";
import type { z } from "zod";
import { callAction } from "@/lib/call-action";
import { correctPersonAction } from "@/server/actions/operations";

/** Quem é a pessoa: define quais campos fazem sentido na correção. */
export type CorrectionKind = "member" | "guest" | "employee";

const CPF_HINT: Record<CorrectionKind, string> = {
  member: "Obrigatório para filiados.",
  guest: "Convidado pode ficar sem (ex.: criança).",
  employee: "Opcional para colaboradores do SINDSERM: ajuda a achar a pessoa na portaria.",
};

/**
 * Correção de cadastro. Matrícula e lotação só aparecem para filiados; "menor
 * de 18" não aparece para colaboradores (os campos escondidos seguem como estão).
 */
export function PersonCorrectionDialog({ initial, kind = "member" }: { initial: PersonCorrectionInput; kind?: CorrectionKind }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<PersonCorrectionInput, unknown, z.output<typeof personCorrectionSchema>>({
    resolver: zodResolver(personCorrectionSchema),
    defaultValues: initial,
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(() => {
    startTransition(async () => {
      const result = await callAction(correctPersonAction(form.getValues()));
      if (!result.ok) {
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(path as FieldPath<PersonCorrectionInput>, { message });
        }
        return;
      }
      toast.success("Cadastro corrigido.");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil /> Corrigir dados
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Correção de cadastro</DialogTitle>
            <DialogDescription>
              {kind === "member"
                ? "CPF e matrícula não podem repetir os de outra pessoa. O CPF de quem tem ficha de filiação não muda. Tudo fica na auditoria."
                : "O CPF não pode repetir o de outra pessoa. Tudo fica na auditoria."}
            </DialogDescription>
          </DialogHeader>
          <FormField id="fix-name" label="Nome completo" error={errors.fullName?.message}>
            <Input id="fix-name" {...form.register("fullName")} />
          </FormField>
          <FormField
            id="fix-cpf"
            label="CPF"
            optional
            description={CPF_HINT[kind]}
            error={errors.cpf?.message}
          >
            <Controller
              control={form.control}
              name="cpf"
              render={({ field }) => <CpfInput id="fix-cpf" {...field} value={field.value ?? ""} />}
            />
          </FormField>
          <FormField id="fix-whatsapp" label="WhatsApp" optional error={errors.whatsapp?.message}>
            <Controller
              control={form.control}
              name="whatsapp"
              render={({ field }) => <PhoneInput id="fix-whatsapp" {...field} value={field.value ?? ""} />}
            />
          </FormField>
          {kind === "member" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="fix-registration" label="Matrícula" optional error={errors.registrationNumber?.message}>
                <Input id="fix-registration" {...form.register("registrationNumber")} />
              </FormField>
              <FormField id="fix-workplace" label="Lotação" optional error={errors.workplace?.message}>
                <Input id="fix-workplace" {...form.register("workplace")} />
              </FormField>
            </div>
          ) : null}
          {kind === "employee" ? null : (
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
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader className="animate-spin-steps" /> : null} Salvar correção
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
