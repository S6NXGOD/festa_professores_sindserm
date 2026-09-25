"use client";

import { AnimatePresence, motion } from "motion/react";
import type { FieldError, FieldErrorsImpl, Merge } from "react-hook-form";
import { toast } from "sonner";
import { playSound } from "@/lib/sound";
import { FormField } from "@/components/forms/form-field";
import { CpfInput } from "@/components/forms/masked-input";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gift,
  Info,
  Lock,
  Loader,
  PartyPopper,
  Pencil,
  Shield,
  Teach,
  User,
  UserPlus,
} from "@/components/icons/pixel";
import { PixelTag, PlayerTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { GuestInput } from "@/domain/schemas";
import { cn } from "@/lib/utils";

/** Seção de etapa com transição lateral (como trocar de faixa na fita). */
export function StepFrame({ stepKey, direction, children }: { stepKey: string; direction: number; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" custom={direction} initial={false}>
      <motion.section
        key={stepKey}
        custom={direction}
        initial={{ opacity: 0, x: direction * 32, filter: "blur(2px)" }}
        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, x: direction * -32, filter: "blur(2px)" }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-5"
      >
        {children}
      </motion.section>
    </AnimatePresence>
  );
}

export function StepHeader({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <header>
      <h2 className="display text-[2rem] text-fg sm:text-4xl">{title}</h2>
      {subtitle ? <p className="mt-2 text-sm leading-relaxed text-fg-muted">{subtitle}</p> : null}
    </header>
  );
}

/** Barra fixa de navegação (fica à mão no celular). */
export function WizardNav({
  canGoBack,
  onBack,
  onNext,
  isLast,
  pending,
  submitLabel,
}: {
  canGoBack: boolean;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="safe-bottom sticky bottom-0 z-20 -mx-4 mt-6 flex gap-3 border-t border-line/70 bg-ink/92 px-4 pt-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:backdrop-blur-none">
      {canGoBack ? (
        <Button type="button" variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={onBack} disabled={pending}>
          <ArrowLeft /> Voltar
        </Button>
      ) : null}
      {/* Keys distintas: o React não pode reaproveitar o botão "Continuar" como submit no mesmo clique. */}
      {!isLast ? (
        <Button key="next" type="button" size="lg" className="flex-[2]" onClick={onNext} data-testid="wizard-next">
          Continuar <ArrowRight />
        </Button>
      ) : (
        <Button key="submit" type="submit" size="lg" className="flex-[2]" disabled={pending} data-testid="submit-registration">
          {pending ? <Loader className="animate-spin-steps" /> : <PartyPopper />}
          {pending ? "Gravando..." : submitLabel}
        </Button>
      )}
    </div>
  );
}

/** Pergunta obrigatória: kit e convidado são exclusivos de professoras e professores. */
export function TeacherQuestion({
  value,
  onChange,
  error,
  subject = "Você",
}: {
  value: boolean | null | undefined;
  onChange: (value: boolean) => void;
  error?: string;
  subject?: "Você" | "A pessoa";
}) {
  const self = subject === "Você";
  const options = [
    {
      answer: true,
      icon: Teach,
      title: self ? "Sim, sou professor(a)" : "Sim, é professor(a)",
      hint: self ? "Tenho direito ao kit e a 1 convidado" : "Tem direito ao kit e a 1 convidado",
    },
    {
      answer: false,
      icon: User,
      title: self ? "Não sou professor(a)" : "Não é professor(a)",
      hint: self ? "Participo sem kit de consumação" : "Participa sem kit de consumação",
    },
  ] as const;
  return (
    <fieldset className="space-y-3">
      <legend className="text-[0.78rem] font-bold tracking-[0.08em] text-fg-muted uppercase">
        {subject === "Você" ? "Você é professor(a)?" : "A pessoa é professor(a)?"}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.answer;
          return (
            <button
              key={String(option.answer)}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                playSound("blip");
                onChange(option.answer);
              }}
              data-testid={option.answer ? "teacher-yes" : "teacher-no"}
              className={cn(
                "group flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition-[border-color,background-color,box-shadow,transform] outline-none focus-visible:ring-[3px] focus-visible:ring-red/50 active:scale-[0.99]",
                selected
                  ? "border-red bg-brand-soft shadow-[0_0_24px_-10px_var(--glow)]"
                  : "border-line-strong bg-surface-2 hover:border-[#55555c]",
                error && value == null && "border-danger/70",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors",
                  selected ? "bg-brand text-white" : "bg-surface-3 text-fg-muted",
                )}
              >
                <option.icon className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-fg">{option.title}</span>
                <span className="block text-xs text-fg-muted">{option.hint}</span>
              </span>
              {selected ? <Check className="ml-auto size-5 text-red" /> : null}
            </button>
          );
        })}
      </div>
      {error && value == null ? (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {/* Só para quem se declara professor(a): é essa resposta que dá direito ao kit. */}
      <AnimatePresence initial={false}>
        {self && value === true ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 overflow-hidden rounded-lg border border-line-strong bg-surface-2 p-3 text-sm text-fg-muted"
            data-testid="teacher-check-notice"
          >
            <Shield className="mt-0.5 size-4 shrink-0 text-red" />
            <span>
              <strong className="text-fg">Atenção:</strong> na portaria, a equipe confere se você é professor(a).
            </span>
          </motion.p>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {value === false ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 overflow-hidden rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-fg"
          >
            <Info className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Tudo certo: {subject === "Você" ? "você participa" : "a pessoa participa"} da festa normalmente. O kit de consumação e
              o convidado são exclusivos para professoras e professores.
            </span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </fieldset>
  );
}

type GuestErrors = Merge<FieldError, FieldErrorsImpl<GuestInput>> | undefined;
type GuestField = keyof GuestInput;

const EMPTY_GUEST: GuestInput = { fullName: "", cpf: "", isMinor: false };

/** Campos do convidado, validados um a um (ver validateGuestStep). */
export const GUEST_FIELD_PATHS = ["guest.fullName", "guest.cpf", "guest.isMinor"] as const;

/**
 * Valida a etapa do convidado campo a campo. Validando o objeto "guest" inteiro,
 * o react-hook-form 7.88 conclui que é inválido mas descarta as mensagens
 * aninhadas: o botão não avançava e nada aparecia na tela.
 */
export async function validateGuestStep(
  guest: unknown,
  trigger: (names: (typeof GUEST_FIELD_PATHS)[number][], options?: { shouldFocus?: boolean }) => Promise<boolean>,
): Promise<boolean> {
  if (!guest) return true;
  const ok = await trigger([...GUEST_FIELD_PATHS], { shouldFocus: true });
  if (!ok) {
    playSound("warn");
    toast.error("Revise os dados do convidado.");
  }
  return ok;
}

/** Player 2: o único convidado de cada professor(a). */
export function GuestFields({
  value,
  onChange,
  errors,
  onFieldEdit,
}: {
  value: GuestInput | null | undefined;
  onChange: (value: GuestInput | null) => void;
  errors: GuestErrors;
  /** Campo editado: permite apagar a mensagem de erro antiga daquele campo. */
  onFieldEdit?: (field: GuestField) => void;
}) {
  const bringing = Boolean(value);
  const guest = value ?? EMPTY_GUEST;
  const edit = (patch: Partial<GuestInput>, field: GuestField) => {
    onChange({ ...guest, ...patch });
    onFieldEdit?.(field);
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceButton
          selected={bringing}
          onClick={() => {
            if (!value) playSound("powerup");
            onChange(value ?? { ...EMPTY_GUEST });
          }}
          icon={UserPlus}
          title="Vou levar convidado(a)"
          hint="1 pessoa, com direito ao kit"
          testId="guest-yes"
        />
        <ChoiceButton
          selected={!bringing}
          onClick={() => {
            if (value) playSound("blip");
            onChange(null);
          }}
          icon={User}
          title="Vou sozinho(a)"
          hint="Dá para cadastrar depois, na festa"
          testId="guest-no"
        />
      </div>

      <AnimatePresence initial={false}>
        {bringing ? (
          <motion.div
            key="player2"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative overflow-clip rounded-2xl border-2 border-red/50 bg-surface p-4 shadow-[0_0_40px_-22px_var(--glow)] sm:p-5"
            data-testid="guest-card"
          >
            <div className="halftone pointer-events-none absolute -top-8 -right-8 size-32 opacity-40 [mask-image:radial-gradient(circle,#000_20%,transparent_70%)]" />
            <div className="relative flex items-center justify-between gap-2">
              <PlayerTag player={2} />
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1, 1] }}
                transition={{ duration: 1.8, times: [0, 0.2, 0.8, 1] }}
                className="pixel text-[0.55rem] text-red"
                aria-hidden
              >
                Entrou no jogo!
              </motion.span>
            </div>
            <div className="relative mt-4 grid gap-4">
              <FormField id="guest-name" label="Nome completo do convidado" error={errors?.fullName?.message}>
                <Input
                  id="guest-name"
                  autoComplete="off"
                  value={guest.fullName}
                  onChange={(event) => edit({ fullName: event.target.value }, "fullName")}
                  aria-invalid={Boolean(errors?.fullName)}
                  data-testid="guest-name"
                />
              </FormField>
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <FormField
                  id="guest-cpf"
                  label="CPF do convidado"
                  optional
                  description="Sem CPF (ex.: criança)? Deixe em branco."
                  error={errors?.cpf?.message}
                >
                  <CpfInput
                    id="guest-cpf"
                    value={guest.cpf}
                    onChange={(cpf) => edit({ cpf }, "cpf")}
                    aria-invalid={Boolean(errors?.cpf)}
                    data-testid="guest-cpf"
                  />
                </FormField>
                <label
                  htmlFor="guest-minor"
                  className="flex h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-line-strong bg-surface-2 px-3.5 text-sm font-semibold text-fg sm:mt-[1.7rem]"
                >
                  <Checkbox
                    id="guest-minor"
                    checked={guest.isMinor}
                    onCheckedChange={(checked) => edit({ isMinor: checked === true }, "isMinor")}
                  />
                  Menor de 18 anos
                </label>
              </div>
            </div>
            <p className="relative mt-4 flex items-start gap-2 rounded-lg bg-ink/60 p-3 text-sm text-fg-muted">
              <Gift className="mt-0.5 size-4 shrink-0 text-red" />
              <span>
                O convidado tem direito ao kit de consumação. Ele é entregue na recepção depois que o(a) professor(a) chegar.
              </span>
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  icon: Icon,
  title,
  hint,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof User;
  title: string;
  hint: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition-[border-color,background-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-red/50",
        selected ? "border-red bg-brand-soft shadow-[0_0_24px_-10px_var(--glow)]" : "border-line-strong bg-surface-2 hover:border-[#55555c]",
      )}
    >
      <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-lg", selected ? "bg-brand text-white" : "bg-surface-3 text-fg-muted")}>
        <Icon className="size-6" />
      </span>
      <span>
        <span className="block font-bold text-fg">{title}</span>
        <span className="block text-xs text-fg-muted">{hint}</span>
      </span>
    </button>
  );
}

/** Bloco da revisão com botão de editar. */
export function ReviewBlock({
  title,
  onEdit,
  children,
  tag,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
  tag?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface-2/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="display flex items-center gap-2 text-xl text-fg">
          {title}
          {tag}
        </h3>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil /> Editar
        </Button>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ReviewItem({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[0.7rem] font-bold tracking-[0.08em] text-fg-dim uppercase">{label}</dt>
      <dd className="font-semibold break-words text-fg">{value || "—"}</dd>
    </div>
  );
}

/** Aviso de privacidade (LGPD) exibido antes do consentimento. */
export function PrivacyNotice({ ficha = false }: { ficha?: boolean }) {
  return (
    <details className="group rounded-xl border border-line bg-surface-2/60 p-4 text-sm leading-relaxed text-fg-muted">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-fg">
        <Shield className="size-4 text-red" /> Aviso de privacidade (LGPD)
        <span className="ml-auto text-xs font-medium text-fg-dim group-open:hidden">ler</span>
      </summary>
      <p className="mt-3">
        {ficha
          ? "O SINDSERM usa os dados da ficha e as cópias do RG e do contracheque para a sua filiação (inclusive o desconto em folha que você autorizar) e para a sua entrada na festa. As cópias ficam guardadas com criptografia e só a equipe do SINDSERM abre."
          : "O SINDSERM usa os seus dados (nome, CPF, WhatsApp, matrícula e lotação) e os do convidado (nome, CPF se informado e se é menor de idade) só para a inscrição, para confirmar a filiação e para a entrada na festa."}{" "}
        O CPF e a matrícula identificam cada pessoa e evitam cadastros duplicados.
      </p>
      <p className="mt-2">
        Os QR Codes não contêm dados pessoais. As informações ficam restritas à equipe do SINDSERM e não são compartilhadas
        com terceiros. Você pode pedir informações ou correções ao sindicato.
      </p>
    </details>
  );
}

export function ConsentBox({
  id,
  checked,
  onChange,
  error,
  children,
  testId,
  icon: Icon = Lock,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  error?: string;
  children: React.ReactNode;
  testId?: string;
  icon?: typeof Lock;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-sm leading-relaxed transition-colors",
          checked ? "border-red/60 bg-brand-soft" : "border-line-strong bg-surface-2",
          error && !checked && "border-danger",
        )}
      >
        <Checkbox
          id={id}
          className="mt-0.5"
          checked={checked}
          onCheckedChange={(value) => onChange(value === true)}
          aria-invalid={Boolean(error)}
          data-testid={testId}
        />
        <span className="text-fg">
          <Icon className="mr-1.5 mb-0.5 inline size-4 text-red" />
          {children}
        </span>
      </label>
      {error && !checked ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Aviso destacado usado na revisão. */
export function Callout({
  tone = "info",
  icon: Icon = Info,
  children,
  testId,
}: {
  tone?: "info" | "warning" | "red";
  icon?: typeof Info;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed",
        tone === "warning" && "border-warning/40 bg-warning-soft text-fg",
        tone === "info" && "border-line bg-surface-2 text-fg-muted",
        tone === "red" && "border-red/50 bg-[linear-gradient(135deg,rgb(227_0_15/0.22),rgb(227_0_15/0.06))] text-fg",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", tone === "warning" ? "text-warning" : "text-red")} />
      <div>{children}</div>
    </div>
  );
}

export { PixelTag };
