"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ClipboardNote, Crown, Eye, Lock, Pencil, type PixelIcon, Reload, Shield } from "@/components/icons/pixel";
import { ToneBadge } from "@/components/status/status-badge";
import { Switch } from "@/components/ui/switch";
import {
  ACCESS_GROUPS,
  ACCESS_LEVEL_LABEL,
  type AccessLevel,
  type AccessMap,
  type AccessModule,
  isAccessFixed,
  MODULE_INFO,
  ROLE_PRESETS,
  sameAccess,
} from "@/domain/access";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/domain/labels";
import { STAFF_ROLES, type StaffRole } from "@/domain/types";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

const LEVEL_ICON = { none: Lock, view: Eye, edit: Pencil } as const;
/** Cor por nível: dá para bater o olho e ver o que a pessoa pode. */
const LEVEL_TONE: Record<AccessLevel, string> = {
  none: "border-line-strong bg-surface-3 text-fg",
  view: "border-warning bg-warning/15 text-warning",
  edit: "border-success bg-success/15 text-success-text",
};
const ROLE_ICON: Record<StaffRole, PixelIcon> = { ADMIN: Crown, ATTENDANT: ClipboardNote, SECURITY: Shield };

/** Administrador: tudo liberado, nada para marcar — só a confirmação do que ele alcança. */
function FullAccessCard() {
  return (
    <div className="rounded-xl border border-success/50 bg-success-soft p-3.5" data-testid="admin-full-access">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-success text-success-foreground shadow-[0_3px_0_0_#0f6b33]">
          <Crown className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="display text-xl leading-none text-fg">Acesso total</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            Administrador vê e edita todas as áreas e vê o CPF completo. Não há nada para marcar — e nada é tirado dele depois.
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Áreas liberadas">
        {[...ACCESS_GROUPS.flatMap((group) => group.modules.map((module) => MODULE_INFO[module].label)), "CPF completo"].map((label) => (
          <li
            key={label}
            className="inline-flex items-center gap-1 rounded-md border border-success/35 bg-ink/40 px-2 py-1 text-[0.7rem] font-bold text-success-text"
          >
            <Check className="size-3" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Perfil + ajuste área por área. Administrador tem acesso total (sem ajuste);
 * Atendimento e Segurança/Recepção já vêm com o modelo marcado, e mexer numa
 * área deixa as permissões "personalizadas" (dá para voltar ao modelo).
 */
export function AccessEditor({
  role,
  access,
  onChange,
  disabled = false,
}: {
  role: StaffRole;
  access: AccessMap;
  onChange: (next: { role: StaffRole; access: AccessMap }) => void;
  disabled?: boolean;
}) {
  const fixed = isAccessFixed(role);
  const custom = !fixed && !sameAccess(access, ROLE_PRESETS[role]);

  function setLevel(module: AccessModule, level: AccessLevel) {
    playSound("blip");
    onChange({ role, access: { ...access, modules: { ...access.modules, [module]: level } } });
  }

  function pickRole(option: StaffRole) {
    if (option !== role) playSound(option === "ADMIN" ? "powerup" : "blip");
    // O modelo do perfil escolhido já vem marcado.
    onChange({ role: option, access: ROLE_PRESETS[option] });
  }

  return (
    <div className="grid gap-4" data-testid="access-editor">
      <div className="grid gap-2" role="radiogroup" aria-label="Perfil">
        <p className="text-xs font-bold tracking-[0.1em] text-fg-muted uppercase">Perfil</p>
        {STAFF_ROLES.map((option) => {
          const Icon = ROLE_ICON[option];
          const selected = role === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => pickRole(option)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 border-line-strong bg-surface-2 p-3 text-left transition-[border-color,background-color] disabled:opacity-50",
                selected && "border-red bg-brand-soft",
              )}
              data-testid={`role-${option}`}
            >
              <span
                className={cn(
                  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                  selected ? "bg-red text-white" : "bg-surface-3 text-fg-muted",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-fg">{ROLE_LABEL[option]}</span>
                <span className="block text-xs text-fg-muted">{ROLE_DESCRIPTION[option]}</span>
              </span>
              {selected ? <Check className="size-5 shrink-0 text-red" /> : null}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {fixed ? (
          <motion.div
            key="acesso-total"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <FullAccessCard />
          </motion.div>
        ) : (
          <motion.div
            key="por-area"
            className="grid gap-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            data-testid="access-areas"
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold tracking-[0.1em] text-fg-muted uppercase">Permissões por área</p>
                {custom ? (
                  <div className="flex items-center gap-2">
                    <ToneBadge tone="info">Personalizado</ToneBadge>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange({ role, access: ROLE_PRESETS[role] })}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red hover:underline disabled:opacity-50"
                      data-testid="access-reset"
                    >
                      <Reload className="size-3.5" /> Voltar ao perfil
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-fg-dim" data-testid="access-preset">
                    Iguais às do perfil
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                Já vem marcado o que {ROLE_LABEL[role]} faz. Ajuste só o que esta pessoa precisar a mais (ou a menos).
              </p>
            </div>

            {ACCESS_GROUPS.map((group) => (
              <fieldset key={group.title} className="grid gap-2" disabled={disabled}>
                <legend className="pixel mb-1 text-[0.5rem] tracking-[0.12em] text-fg-dim uppercase">{group.title}</legend>
                {group.modules.map((module) => {
                  const info = MODULE_INFO[module];
                  const level = access.modules[module];
                  const hint = level === "edit" ? info.edit : level === "view" ? info.view : null;
                  const changed = level !== ROLE_PRESETS[role].modules[module];
                  return (
                    <div
                      key={module}
                      className={cn("rounded-xl border bg-surface-2 p-3", changed ? "border-red/55" : "border-line")}
                      data-testid={`access-${module}`}
                    >
                      <p className="flex items-center justify-between gap-2 text-sm font-bold text-fg">
                        {info.label}
                        {changed ? <span className="pixel text-[0.45rem] text-red">Ajustado</span> : null}
                      </p>
                      <div
                        className={cn("mt-2 grid gap-1.5", info.levels.length === 3 ? "grid-cols-3" : "grid-cols-2")}
                        role="radiogroup"
                        aria-label={info.label}
                      >
                        {info.levels.map((option) => {
                          const Icon = LEVEL_ICON[option];
                          const selected = level === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => setLevel(module, option)}
                              className={cn(
                                // Celular estreito: ícone em cima do texto, para "Sem acesso" não quebrar em duas linhas.
                                "flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-1 py-1 text-[0.7rem] leading-tight font-bold whitespace-nowrap transition-[color,background-color,border-color,transform] active:scale-95 min-[420px]:flex-row min-[420px]:gap-1.5 min-[420px]:px-1.5 min-[420px]:text-xs",
                                selected ? LEVEL_TONE[option] : "border-transparent bg-surface text-fg-muted hover:text-fg",
                              )}
                              data-testid={`access-${module}-${option}`}
                            >
                              <Icon className="size-3.5 shrink-0" />
                              {option === "view" && info.levels.length === 2
                                ? "Ver"
                                : option === "edit" && info.levels.length === 2
                                  ? "Acessar"
                                  : ACCESS_LEVEL_LABEL[option]}
                            </button>
                          );
                        })}
                      </div>
                      <p className={cn("mt-1.5 text-xs", hint ? "text-fg-muted" : "text-fg-dim")}>{hint ?? "Não aparece no menu."}</p>
                    </div>
                  );
                })}
              </fieldset>
            ))}

            <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <span>
                <span className="block text-sm font-bold text-fg">CPF completo</span>
                <span className="block text-xs text-fg-muted">Sem isto, o CPF aparece mascarado nas buscas e telas.</span>
              </span>
              <Switch
                checked={access.fullCpf}
                onCheckedChange={(checked) => onChange({ role, access: { ...access, fullCpf: checked } })}
                disabled={disabled}
                data-testid="access-fullCpf"
              />
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
