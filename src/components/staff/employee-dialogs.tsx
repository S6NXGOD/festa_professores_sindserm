"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import { Check, Gift, Heart, List, Loader, Login, Pencil, QrCode, UserPlus, Users, Warning } from "@/components/icons/pixel";
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
import { CATEGORY_STYLE, CategoryPicker } from "./employee-category";
import { firstName } from "@/lib/text";

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

/** Quem costuma convidar (sugestões; dá para escrever qualquer outro, ex.: "Família do Carlos"). */
const INVITER_SUGGESTIONS = ["Diretoria", "Presidência", "Vice-presidência", "Secretaria-geral", "Tesouraria", "Funcionários", "Prestadores de serviço"];

/** Cortesia: quem convidou (aparece no voucher e agrupa a lista). */
export function InviterField({
  id,
  error,
  register,
  inviters,
  label = "Quem convidou",
  description,
}: {
  id: string;
  error?: string;
  register: React.InputHTMLAttributes<HTMLInputElement>;
  inviters: string[];
  label?: string;
  description?: string;
}) {
  const options = [...new Set([...inviters, ...INVITER_SUGGESTIONS])];
  return (
    <FormField id={id} label={label} optional description={description} error={error}>
      <Input id={id} list={`${id}-options`} placeholder="Ex.: Presidência, Família do Carlos" autoComplete="off" data-testid={id} {...register} />
      <datalist id={`${id}-options`}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </FormField>
  );
}

/** O que cada cortesia ganha. */
export function CourtesyRightsNote({ withKit = true }: { withKit?: boolean }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-[#ff4fb4]/45 bg-[#ff4fb4]/10 p-3 text-sm text-fg">
      <Heart className="mt-0.5 size-4 shrink-0 text-[#ff8fd0]" />
      {withKit ? (
        <span>
          Ganha voucher próprio e <strong>1 kit de consumação</strong>, que sai junto com a entrada (do estoque dos colaboradores). Não
          leva convidado: cada pessoa é uma cortesia.
        </span>
      ) : (
        <span>
          Ganha voucher próprio e entra <strong>sem kit de consumação</strong>: a portaria vê o aviso e o estoque não é mexido. Não leva
          convidado: cada pessoa é uma cortesia.
        </span>
      )}
    </p>
  );
}

/** Cortesia com ou sem kit de consumação (ex.: quem vem só para a festa). */
export function KitChoice({ value, onChange }: { value: boolean; onChange: (withKit: boolean) => void }) {
  const options = [
    { withKit: true, label: "Com kit", hint: "Entrada + 1 kit de consumação", icon: Gift },
    { withKit: false, label: "Sem kit", hint: "Só a entrada", icon: Login },
  ];
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-bold text-fg">Kit de consumação</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kit de consumação">
        {options.map((option) => {
          const selected = value === option.withKit;
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                playSound("blip");
                onChange(option.withKit);
              }}
              className={cn(
                "flex min-h-14 items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-left transition-[color,background-color,border-color,box-shadow,transform] active:scale-95",
                selected
                  ? option.withKit
                    ? CATEGORY_STYLE.COURTESY.selected
                    : "border-fg/70 bg-surface-3 text-fg shadow-[0_0_18px_-8px_rgb(255_255_255/0.5)]"
                  : "border-line-strong bg-surface-2 text-fg-muted hover:text-fg",
              )}
              data-testid={option.withKit ? "courtesy-with-kit" : "courtesy-without-kit"}
            >
              <option.icon className="size-5 shrink-0" />
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="block text-xs font-medium opacity-80">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
        `${firstName(values.fullName)} liberado(a) para a festa!` +
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
  isMinor?: boolean;
  /** Cortesia com kit (colaborador(a) sempre true). */
  withKit?: boolean;
}

/** Corrigir os dados de um(a) colaborador(a) (o convidado é trocado na tela da pessoa). */
export function EditEmployeeDialog({
  initial,
  trigger,
  inviters = [],
}: {
  initial: EmployeeEditValues;
  trigger: React.ReactNode;
  /** Cortesia: quem já convidou alguém (sugestões do campo). */
  inviters?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const values = { ...initial, isMinor: initial.isMinor ?? false, withKit: initial.withKit ?? true };
  const courtesy = initial.category === "COURTESY";
  const form = useForm<UpdateEmployeeInput, unknown, UpdateEmployeeData>({ resolver: zodResolver(updateEmployeeSchema), defaultValues: values });
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
        if (value) form.reset(values);
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{courtesy ? "Editar cortesia" : "Editar colaborador(a)"}</DialogTitle>
          <DialogDescription>
            {courtesy ? "Dados da pessoa convidada pela organização." : "Para trocar o convidado, abra a pessoa (toque no nome) e use a seção Convidado."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate id="edit-employee-form">
          {courtesy ? null : (
            <Controller
              control={form.control}
              name="category"
              render={({ field }) => <CategoryPicker value={(field.value ?? "STAFF") as EmployeeCategory} onChange={field.onChange} />}
            />
          )}
          <FormField id="edit-employee-name" label="Nome completo" error={e.fullName?.message}>
            <Input id="edit-employee-name" autoComplete="off" {...form.register("fullName")} />
          </FormField>
          {courtesy ? (
            <InviterField id="edit-courtesy-inviter" error={e.jobTitle?.message} register={form.register("jobTitle")} inviters={inviters} />
          ) : (
            <SectorField error={e.jobTitle?.message} register={form.register("jobTitle")} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="edit-employee-cpf" label="CPF" optional error={e.cpf?.message}>
              <Controller control={form.control} name="cpf" render={({ field }) => <CpfInput id="edit-employee-cpf" {...field} />} />
            </FormField>
            <FormField id="edit-employee-whatsapp" label="WhatsApp" optional error={e.whatsapp?.message}>
              <Controller control={form.control} name="whatsapp" render={({ field }) => <PhoneInput id="edit-employee-whatsapp" {...field} />} />
            </FormField>
          </div>
          {courtesy ? (
            <>
              <Controller
                control={form.control}
                name="withKit"
                render={({ field }) => <KitChoice value={field.value !== false} onChange={field.onChange} />}
              />
              <Controller
                control={form.control}
                name="isMinor"
                render={({ field }) => <MinorCheckbox checked={Boolean(field.value)} onChange={field.onChange} />}
              />
            </>
          ) : null}
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

/**
 * Liberar vários de uma vez, colando uma lista. Colaboradores: "Nome; Setor;
 * Convidado". Cortesias (`courtesy`): "Nome; Quem convidou", com um campo de
 * quem convidou para a lista toda (ex.: a família inteira de alguém).
 */
export function BulkEmployeesDialog({ courtesy = false, inviters = [] }: { courtesy?: boolean; inviters?: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [invitedBy, setInvitedBy] = useState("");
  const [withKit, setWithKit] = useState(true);
  const [category, setCategory] = useState<EmployeeCategory>(courtesy ? "COURTESY" : "STAFF");
  const [pending, startTransition] = useTransition();
  const preview = parseEmployeeLines(text, { courtesy });
  const guests = preview.rows.filter((row) => row.guestName).length;
  const sharedInviter = invitedBy.trim();

  function submit() {
    startTransition(async () => {
      const result = await callAction(
        createEmployeesFromListAction({ text, category, invitedBy: courtesy ? invitedBy : "", withKit: courtesy ? withKit : true }),
      );
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        return;
      }
      const { created, guests: guestsCreated, skipped } = result.data;
      playSound(created > 0 ? "fanfare" : "warn");
      toast.success(
        (courtesy
          ? `${created} ${created === 1 ? "cortesia cadastrada" : "cortesias cadastradas"}`
          : `${created} ${created === 1 ? "colaborador liberado" : "colaboradores liberados"}`) +
          (guestsCreated ? `, com ${guestsCreated} ${guestsCreated === 1 ? "convidado" : "convidados"}` : "") +
          "." +
          (skipped.length ? ` ${skipped.length} já estava${skipped.length > 1 ? "m" : ""} na lista.` : ""),
      );
      setText("");
      setInvitedBy("");
      setWithKit(true);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid={courtesy ? "bulk-courtesies" : "bulk-employees"}>
          <List /> Colar lista
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{courtesy ? "Várias cortesias de uma vez" : "Liberar vários de uma vez"}</DialogTitle>
          <DialogDescription>
            {courtesy ? (
              <>
                Cole a lista do WhatsApp ou da planilha, uma pessoa por linha: <strong className="text-fg">Nome; Quem convidou</strong> (quem
                convidou é opcional). Numeração é ignorada e quem já está na lista é pulado.
              </>
            ) : (
              <>
                Cole a lista do WhatsApp ou da planilha, uma pessoa por linha: <strong className="text-fg">Nome; Setor ou cargo; Convidado</strong>{" "}
                (setor e convidado são opcionais). Numeração é ignorada e quem já está na lista é pulado.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {courtesy ? (
          <InviterField
            id="bulk-courtesy-inviter"
            label="Quem convidou (para a lista toda)"
            description="Ex.: a família inteira do presidente. Linha com quem convidou próprio vale a da linha."
            register={{ value: invitedBy, onChange: (event) => setInvitedBy(event.target.value) }}
            inviters={inviters}
          />
        ) : (
          <CategoryPicker value={category} onChange={setCategory} label="Todos desta lista são" />
        )}
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          placeholder={
            courtesy
              ? "Carla Mendes Silva; Presidência\nJoão Pedro Mendes\nLucas Mendes Silva"
              : "Maria Souza; Financeiro; João Souza\nPedro Lima; Jurídico\nAna Costa;; Bia Costa"
          }
          aria-label={courtesy ? "Lista de cortesias" : "Lista de colaboradores"}
          data-testid={courtesy ? "bulk-courtesies-text" : "bulk-employees-text"}
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
                  {row.jobTitle || (courtesy && sharedInviter) ? (
                    <span className={cn("ml-auto shrink-0 text-xs font-semibold", courtesy ? "text-[#ff8fd0]" : "text-warning")}>
                      {courtesy ? `Convite: ${row.jobTitle ?? sharedInviter}` : row.jobTitle}
                    </span>
                  ) : null}
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
        {courtesy ? (
          <>
            <KitChoice value={withKit} onChange={setWithKit} />
            <CourtesyRightsNote withKit={withKit} />
          </>
        ) : (
          <RightsNote />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={pending || preview.rows.length === 0 || preview.errors.length > 0}
            data-testid={courtesy ? "save-bulk-courtesies" : "save-bulk-employees"}
          >
            {pending ? <Loader className="animate-spin-steps" /> : <UserPlus />} {courtesy ? "Cadastrar" : "Liberar"} {preview.rows.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Menor de 18 anos": a portaria vê o aviso na hora de liberar a entrada. */
export function MinorCheckbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm font-semibold text-fg">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} data-testid="courtesy-minor" />
      Menor de 18 anos
    </label>
  );
}

/**
 * Nova cortesia da organização (amigos, familiares, autoridades). Depois de
 * gravar, o diálogo fica aberto com "Cadastrar mais uma" (mantém quem convidou):
 * a família inteira entra em sequência, sem reabrir nada.
 */
export function CourtesyDialog({ inviters = [] }: { inviters?: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState<{ name: string; personId: string }[]>([]);
  const [justAdded, setJustAdded] = useState<{ name: string; personId: string } | null>(null);
  const defaults: EmployeeInput = {
    fullName: "",
    cpf: "",
    whatsapp: "",
    jobTitle: "",
    category: "COURTESY",
    isMinor: false,
    withKit: true,
    guest: null,
  };
  const form = useForm<EmployeeInput, unknown, EmployeeData>({ resolver: zodResolver(employeeSchema), defaultValues: defaults });
  const e = form.formState.errors;
  const withKit = useWatch({ control: form.control, name: "withKit" }) !== false;

  function another() {
    playSound("blip");
    // Mantém quem convidou e o "com/sem kit": a próxima pessoa costuma ser da mesma família ou do mesmo convite.
    form.reset({ ...defaults, jobTitle: form.getValues("jobTitle") ?? "", withKit: form.getValues("withKit") ?? true });
    setJustAdded(null);
    window.setTimeout(() => document.getElementById("courtesy-name")?.focus(), 50);
  }

  const submit = form.handleSubmit(() => {
    startTransition(async () => {
      const values = form.getValues();
      const result = await callAction(createEmployeeAction({ ...values, category: "COURTESY", guest: null }));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) form.setError(path as FieldPath<EmployeeInput>, { message });
        return;
      }
      playSound("powerup");
      const entry = { name: values.fullName, personId: result.data.personId };
      setAdded((list) => [...list, entry]);
      setJustAdded(entry);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        if (value) {
          form.reset(defaults);
          setAdded([]);
          setJustAdded(null);
        }
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="add-courtesy">
          <Heart /> Nova cortesia
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova cortesia</DialogTitle>
          <DialogDescription>
            Amigos, familiares e convidados da organização (cadastro interno, não aparece no link público). CPF e WhatsApp são opcionais:
            o WhatsApp serve para mandar o voucher.
          </DialogDescription>
        </DialogHeader>
        <AnimatePresence mode="wait" initial={false}>
          {justAdded ? (
            <motion.div
              key="added"
              initial={{ opacity: 0, scale: 0.9, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
              className="grid gap-4 rounded-2xl border-2 border-[#ff4fb4]/60 bg-[#ff4fb4]/10 p-5 text-center"
              data-testid="courtesy-added"
            >
              <motion.span
                initial={{ scale: 0.3, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 14 }}
                className="mx-auto inline-flex size-14 items-center justify-center rounded-xl bg-[#ff4fb4] text-ink shadow-[0_0_30px_-6px_rgb(255_79_180/0.9)]"
              >
                <Check className="size-8" />
              </motion.span>
              <div>
                <p className="pixel text-[0.55rem] text-[#ff8fd0]">+1 cortesia</p>
                <p className="display mt-1 text-3xl break-words text-fg">{firstName(justAdded.name)} na lista!</p>
                <p className="mt-1 text-sm text-fg-muted">
                  O voucher já está pronto{withKit ? "" : " (sem kit de consumação)"}.{added.length > 1 ? ` ${added.length} cadastradas agora.` : ""}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" size="lg" onClick={another} data-testid="courtesy-another">
                  <UserPlus /> Cadastrar mais uma
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href={`/painel/participantes/${justAdded.personId}/voucher`} data-testid="courtesy-voucher">
                    <QrCode /> Ver / mandar voucher
                  </Link>
                </Button>
              </div>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Pronto
              </Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onSubmit={submit}
              className="grid gap-4"
              noValidate
              id="courtesy-form"
            >
              <FormField id="courtesy-name" label="Nome completo" error={e.fullName?.message}>
                <Input id="courtesy-name" autoComplete="off" data-testid="courtesy-name" {...form.register("fullName")} />
              </FormField>
              <InviterField id="courtesy-inviter" error={e.jobTitle?.message} register={form.register("jobTitle")} inviters={inviters} />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="courtesy-cpf" label="CPF" optional error={e.cpf?.message}>
                  <Controller control={form.control} name="cpf" render={({ field }) => <CpfInput id="courtesy-cpf" {...field} />} />
                </FormField>
                <FormField id="courtesy-whatsapp" label="WhatsApp" optional error={e.whatsapp?.message}>
                  <Controller control={form.control} name="whatsapp" render={({ field }) => <PhoneInput id="courtesy-whatsapp" {...field} />} />
                </FormField>
              </div>
              <Controller
                control={form.control}
                name="withKit"
                render={({ field }) => <KitChoice value={field.value !== false} onChange={field.onChange} />}
              />
              <Controller
                control={form.control}
                name="isMinor"
                render={({ field }) => <MinorCheckbox checked={Boolean(field.value)} onChange={field.onChange} />}
              />
              <CourtesyRightsNote withKit={withKit} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  {added.length ? "Fechar" : "Cancelar"}
                </Button>
                <Button type="submit" disabled={pending} data-testid="save-courtesy">
                  {pending ? <Loader className="animate-spin-steps" /> : <Heart />} Cadastrar cortesia
                </Button>
              </DialogFooter>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
