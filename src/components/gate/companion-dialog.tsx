"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, type FieldPath, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { CpfInput } from "@/components/forms/masked-input";
import { Check, Info, Loader, Login, UserPlus } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type CompanionData, type CompanionInput, companionSchema } from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import { firstName } from "@/lib/text";
import { addCompanionAction } from "@/server/actions/employees";

/**
 * Convidado(a) sem kit de um(a) colaborador(a) — ex.: chegou junto na portaria.
 * Ganha voucher próprio (cortesia sem kit ligada a quem trouxe) e, na hora, o
 * botão "Registrar entrada agora".
 */
export function CompanionDialog({
  hostEmployeeId,
  hostName,
  personBasePath,
  canCheckIn,
  onDone,
  triggerClassName,
}: {
  hostEmployeeId: string;
  hostName: string;
  /** Onde abrir a pessoa cadastrada (portaria ou painel). */
  personBasePath: string;
  canCheckIn: boolean;
  onDone?: () => void;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ personId: string; name: string } | null>(null);
  const defaults: CompanionInput = { hostEmployeeId, fullName: "", cpf: "", isMinor: false };
  const form = useForm<CompanionInput, unknown, CompanionData>({ resolver: zodResolver(companionSchema), defaultValues: defaults });
  const errors = form.formState.errors;
  const host = firstName(hostName);

  const submit = form.handleSubmit(() => {
    startTransition(async () => {
      const values = form.getValues();
      const result = await callAction(addCompanionAction(values));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) form.setError(path as FieldPath<CompanionInput>, { message });
        return;
      }
      playSound("powerup");
      setCreated({ personId: result.data.personId, name: values.fullName });
      onDone?.();
    });
  });

  function reset() {
    form.reset(defaults);
    setCreated(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        if (value) reset();
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className={triggerClassName} data-testid="open-add-companion">
          <UserPlus /> Convidado sem kit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidado(a) sem kit de {host}</DialogTitle>
          <DialogDescription>
            Entra com voucher próprio, sem kit de consumação. Aparece também em Cortesias, no convite de {host}.
          </DialogDescription>
        </DialogHeader>
        <AnimatePresence mode="wait" initial={false}>
          {created ? (
            <motion.div
              key="pronto"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
              className="grid gap-4 rounded-2xl border-2 border-success/50 bg-success-soft p-5 text-center"
              data-testid="companion-added"
            >
              <motion.span
                initial={{ scale: 0.3, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 14 }}
                className="mx-auto inline-flex size-12 items-center justify-center rounded-xl bg-success text-success-foreground"
              >
                <Check className="size-7" />
              </motion.span>
              <div>
                <p className="display text-2xl text-fg">{firstName(created.name)} na lista!</p>
                <p className="mt-1 text-sm text-fg-muted">Convidado(a) de {host}, sem kit de consumação.</p>
              </div>
              <div className="grid gap-2">
                {canCheckIn ? (
                  <Button
                    size="lg"
                    variant="success"
                    onClick={() => {
                      setOpen(false);
                      router.push(`${personBasePath}/${created.personId}?entrar=1`);
                    }}
                    data-testid="companion-enter-now"
                  >
                    <Login /> Registrar entrada agora
                  </Button>
                ) : null}
                <Button variant="outline" onClick={reset} data-testid="companion-another">
                  <UserPlus /> Cadastrar outro
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Fechar
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={submit} className="grid gap-4" noValidate>
              <FormField id="companion-name" label="Nome completo" error={errors.fullName?.message}>
                <Input id="companion-name" autoComplete="off" data-testid="companion-name" {...form.register("fullName")} />
              </FormField>
              <FormField id="companion-cpf" label="CPF" optional description="Sem CPF (ex.: criança)? Deixe em branco: o QR Code identifica a pessoa." error={errors.cpf?.message}>
                <Controller control={form.control} name="cpf" render={({ field }) => <CpfInput id="companion-cpf" {...field} value={field.value ?? ""} />} />
              </FormField>
              <Controller
                control={form.control}
                name="isMinor"
                render={({ field }) => (
                  <label className="flex items-center gap-3 text-sm font-semibold text-fg">
                    <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} data-testid="companion-minor" />
                    Menor de 18 anos
                  </label>
                )}
              />
              <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm text-fg-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-fg" />
                Sem kit de consumação: na portaria a tela avisa, e o estoque não é mexido.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending} data-testid="save-companion">
                  {pending ? <Loader className="animate-spin-steps" /> : <UserPlus />} Cadastrar sem kit
                </Button>
              </DialogFooter>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
