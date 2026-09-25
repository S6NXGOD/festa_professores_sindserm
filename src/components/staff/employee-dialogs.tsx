"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import { Check, Gift, List, Loader, Pencil, UserPlus, Users, Warning } from "@/components/icons/pixel";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type EmployeeData,
  type EmployeeInput,
  employeeSchema,
  MAX_BULK_EMPLOYEES,
  parseEmployeeLines,
  type UpdateEmployeeData,
  type UpdateEmployeeInput,
  updateEmployeeSchema,
} from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import type { EmployeeCategory } from "@/domain/types";
import { cn } from "@/lib/utils";
import { createEmployeeAction, createEmployeesFromListAction, updateEmployeeAction } from "@/server/actions/employees";
import { CategoryPicker } from "./employee-category";

/** Setores e cargos comuns no sindicato (sugestões; dá para escrever qualquer outro). */
const SECTOR_SUGGESTIONS = [
  "Presidência",
  "Vice-presidência",
  "Secretaria-geral",
  "Tesouraria",
  "Administrativo",
  "Secretaria",
  "Financeiro",
  "Jurídico",
  "Comunicação",
  "Recepção",
  "Assessoria",
  "Serviços gerais",
  "Limpeza",
  "Segurança",
  "Motorista",
];

function SectorField({ error, register }: { error?: string; register: React.InputHTMLAttributes<HTMLInputElement> }) {
  return (
    <FormField id="employee-job" label="Setor ou cargo" optional error={error}>
      <Input id="employee-job" list="employee-job-options" placeholder="Ex.: Presidência, Financeiro, Limpeza" autoComplete="off" {...register} />
      <datalist id="employee-job-options">
        {SECTOR_SUGGESTIONS.map((job) => (
          <option key={job} value={job} />
        ))}
      </datalist>
    </FormField>
  );
}

/** O que cada colaborador(a) liberado(a) ganha (mesmas regras das professoras e professores). */
function RightsNote() {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-fg">
      <Gift className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>
        Ganha voucher próprio, <strong>1 kit de consumação</strong> na entrada e pode levar <strong>1 convidado</strong> (com kit, que
        sai quando o(a) colaborador(a) chegar). Os kits saem do estoque dos colaboradores.
      </span>
    </p>
  );
}

const EMPTY_GUEST = { fullName: "", cpf: "", isMinor: false };

/** Liberar um(a) colaborador(a) do SINDSERM para a festa, já com o convidado (opcional). */
export function EmployeeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaults: EmployeeInput = { fullName: "", cpf: "", whatsapp: "", jobTitle: "", category: "STAFF", guest: null };
  const form = useForm<EmployeeInput, unknown, EmployeeData>({ resolver: zodResolver(employeeSchema), defaultValues: defaults });
  const e = form.formState.errors;
  const guest = useWatch({ control: form.control, name: "guest" });
  const withGuest = guest !== null && guest !== undefined;

  function toggleGuest(value: boolean) {
    playSound("blip");
    form.setValue("guest", value ? EMPTY_GUEST : null, { shouldDirty: true });
    form.clearErrors("guest");
  }

  const submit = form.handleSubmit(() => {
    startTransition(async () => {
      const values = form.getValues();
      const result = await callAction(createEmployeeAction(values));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) form.setError(path as FieldPath<EmployeeInput>, { message });
        return;
      }
      playSound("powerup");
      toast.success(
        `${values.fullName.split(" ")[0]} liberado(a) para a festa!` +
          (result.data.guestName ? ` Convidado: ${result.data.guestName}.` : "") +
          " Os vouchers já estão prontos.",
      );
      form.reset(defaults);
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        if (value) form.reset(defaults);
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="add-employee">
          <UserPlus /> Novo colaborador
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Liberar colaborador(a) para a festa</DialogTitle>
          <DialogDescription>
            Diretoria, funcionários e prestadores de serviço do SINDSERM (cadastro interno, não aparece no link público). CPF e
            WhatsApp são opcionais: o WhatsApp serve para mandar os vouchers.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate id="employee-form">
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => <CategoryPicker value={(field.value ?? "STAFF") as EmployeeCategory} onChange={field.onChange} />}
          />
          <FormField id="employee-name" label="Nome completo" error={e.fullName?.message}>
            <Input id="employee-name" autoComplete="off" {...form.register("fullName")} />
          </FormField>
          <SectorField error={e.jobTitle?.message} register={form.register("jobTitle")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="employee-cpf" label="CPF" optional error={e.cpf?.message}>
              <Controller control={form.control} name="cpf" render={({ field }) => <CpfInput id="employee-cpf" {...field} />} />
            </FormField>
            <FormField id="employee-whatsapp" label="WhatsApp" optional error={e.whatsapp?.message}>
              <Controller control={form.control} name="whatsapp" render={({ field }) => <PhoneInput id="employee-whatsapp" {...field} />} />
            </FormField>
          </div>
          <RightsNote />

          <label
            htmlFor="employee-guest-toggle"
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3.5 transition-colors",
              withGuest ? "border-red/60 bg-brand-soft" : "border-line-strong bg-surface-2",
            )}
          >
            <Users className={cn("size-6 shrink-0", withGuest ? "text-red" : "text-fg-dim")} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-fg">Vai levar convidado?</span>
              <span className="block text-xs text-fg-muted">Dá para cadastrar depois, na tela da pessoa.</span>
            </span>
            <Switch id="employee-guest-toggle" checked={withGuest} onCheckedChange={toggleGuest} data-testid="employee-guest-toggle" />
          </label>

          <AnimatePresence initial={false}>
            {withGuest ? (
              <motion.div
                key="guest"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="overflow-hidden"
              >
                <div className="grid gap-4 rounded-xl border-2 border-red/40 p-4">
                  <PlayerTag player={2} className="w-fit" />
                  <FormField id="employee-guest-name" label="Nome completo do convidado" error={e.guest?.fullName?.message}>
                    <Input id="employee-guest-name" autoComplete="off" {...form.register("guest.fullName")} data-testid="employee-guest-name" />
                  </FormField>
                  <FormField
                    id="employee-guest-cpf"
                    label="CPF do convidado"
                    optional
                    description="Sem CPF (ex.: criança)? Deixe em branco: o QR Code identifica a pessoa."
                    error={e.guest?.cpf?.message}
                  >
                    <Controller
                      control={form.control}
                      name="guest.cpf"
                      render={({ field }) => <CpfInput id="employee-guest-cpf" {...field} value={field.value ?? ""} />}
                    />
                  </FormField>
                  <Controller
                    control={form.control}
                    name="guest.isMinor"
                    render={({ field }) => (
                      <label className="flex items-center gap-3 text-sm font-semibold text-fg">
                        <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
                        Menor de 18 anos
                      </label>
                    )}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="employee-form" disabled={pending} data-testid="save-employee">
            {pending ? <Loader className="animate-spin-steps" /> : <UserPlus />}
            {withGuest ? "Liberar os dois" : "Liberar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface EmployeeEditValues {
  employeeId: string;
  fullName: string;
  cpf: string;
  whatsapp: string;
  jobTitle: string;
  category: EmployeeCategory;
}

/** Corrigir os dados de um(a) colaborador(a) (o convidado é trocado na tela da pessoa). */
export function EditEmployeeDialog({ initial, trigger }: { initial: EmployeeEditValues; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<UpdateEmployeeInput, unknown, UpdateEmployeeData>({ resolver: zodResolver(updateEmployeeSchema), defaultValues: initial });
  const e = form.formState.errors;

  const submit = form.handleSubmit(() => {
    startTransition(async () => {
      const result = await callAction(updateEmployeeAction(form.getValues()));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) form.setError(path as FieldPath<UpdateEmployeeInput>, { message });
        return;
      }
      playSound("blip");
      toast.success("Cadastro atualizado.");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        if (value) form.reset(initial);
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar colaborador(a)</DialogTitle>
          <DialogDescription>Para trocar o convidado, abra a pessoa (toque no nome) e use a seção Convidado.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate id="edit-employee-form">
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => <CategoryPicker value={(field.value ?? "STAFF") as EmployeeCategory} onChange={field.onChange} />}
          />
          <FormField id="edit-employee-name" label="Nome completo" error={e.fullName?.message}>
            <Input id="edit-employee-name" autoComplete="off" {...form.register("fullName")} />
          </FormField>
          <SectorField error={e.jobTitle?.message} register={form.register("jobTitle")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="edit-employee-cpf" label="CPF" optional error={e.cpf?.message}>
              <Controller control={form.control} name="cpf" render={({ field }) => <CpfInput id="edit-employee-cpf" {...field} />} />
            </FormField>
            <FormField id="edit-employee-whatsapp" label="WhatsApp" optional error={e.whatsapp?.message}>
              <Controller control={form.control} name="whatsapp" render={({ field }) => <PhoneInput id="edit-employee-whatsapp" {...field} />} />
            </FormField>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-employee-form" disabled={pending} data-testid="save-edit-employee">
            {pending ? <Loader className="animate-spin-steps" /> : <Pencil />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Liberar vários de uma vez, colando uma lista ("Nome; Setor; Convidado"). */
export function BulkEmployeesDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<EmployeeCategory>("STAFF");
  const [pending, startTransition] = useTransition();
  const preview = parseEmployeeLines(text);
  const guests = preview.rows.filter((row) => row.guestName).length;

  function submit() {
    startTransition(async () => {
      const result = await callAction(createEmployeesFromListAction({ text, category }));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        return;
      }
      const { created, guests: guestsCreated, skipped } = result.data;
      playSound(created > 0 ? "fanfare" : "warn");
      toast.success(
        `${created} ${created === 1 ? "colaborador liberado" : "colaboradores liberados"}` +
          (guestsCreated ? `, com ${guestsCreated} ${guestsCreated === 1 ? "convidado" : "convidados"}` : "") +
          "." +
          (skipped.length ? ` ${skipped.length} já estava${skipped.length > 1 ? "m" : ""} na lista.` : ""),
      );
      setText("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="bulk-employees">
          <List /> Colar lista
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Liberar vários de uma vez</DialogTitle>
          <DialogDescription>
            Cole a lista do WhatsApp ou da planilha, uma pessoa por linha: <strong className="text-fg">Nome; Setor ou cargo; Convidado</strong>{" "}
            (setor e convidado são opcionais). Numeração é ignorada e quem já está na lista é pulado.
          </DialogDescription>
        </DialogHeader>
        <CategoryPicker value={category} onChange={setCategory} label="Todos desta lista são" />
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          placeholder={"Maria Souza; Financeiro; João Souza\nPedro Lima; Jurídico\nAna Costa;; Bia Costa"}
          aria-label="Lista de colaboradores"
          data-testid="bulk-employees-text"
        />
        {preview.rows.length + preview.errors.length > 0 ? (
          // Prévia de como cada linha foi lida: dá para conferir nome, setor e convidado antes de cadastrar.
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface-2 p-2 text-sm" aria-label="Prévia da lista" data-testid="bulk-preview">
            {preview.errors.map((error) => (
              <li key={`erro-${error.line}-${error.message}`} className="flex items-start gap-2 rounded-md bg-warning-soft px-2 py-1.5 font-semibold text-fg">
                <Warning className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span>
                  {error.line ? `Linha ${error.line}: ` : ""}
                  {error.message}
                </span>
              </li>
            ))}
            {preview.rows.map((row) => (
              <li key={row.line} className="px-2 py-1">
                <span className="flex items-center gap-2">
                  <Check className="size-3.5 shrink-0 text-success" />
                  <span className="min-w-0 truncate font-semibold text-fg">{row.fullName}</span>
                  {row.jobTitle ? <span className="ml-auto shrink-0 text-xs font-semibold text-warning">{row.jobTitle}</span> : null}
                </span>
                {row.guestName ? (
                  <span className="mt-0.5 flex items-center gap-1.5 pl-5.5 text-xs text-fg-muted">
                    <Users className="size-3 shrink-0 text-red" /> convidado: {row.guestName}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className={cn("text-sm", preview.errors.length ? "text-warning" : "text-fg-muted")} role="status">
          {preview.rows.length} {preview.rows.length === 1 ? "nome pronto" : "nomes prontos"}
          {guests ? ` · ${guests} com convidado` : ""}
          {preview.errors.length ? ` · ${preview.errors.length} com problema: corrija para cadastrar` : ""}
          {` (até ${MAX_BULK_EMPLOYEES} por vez)`}
        </p>
        <RightsNote />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || preview.rows.length === 0 || preview.errors.length > 0} data-testid="save-bulk-employees">
            {pending ? <Loader className="animate-spin-steps" /> : <UserPlus />} Liberar {preview.rows.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
