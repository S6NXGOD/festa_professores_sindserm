"use client";

import { Eye, Lock, Pencil, Reload } from "@/components/icons/pixel";
import { ToneBadge } from "@/components/status/status-badge";
import { Switch } from "@/components/ui/switch";
import {
  ACCESS_GROUPS,
  ACCESS_LEVEL_LABEL,
  type AccessLevel,
  type AccessMap,
  type AccessModule,
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

/**
 * Perfil de partida + ajuste área por área. Escolher um perfil aplica o modelo;
 * mexer numa área deixa as permissões "personalizadas" (dá para voltar ao modelo).
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
  const custom = !sameAccess(access, ROLE_PRESETS[role]);

  function setLevel(module: AccessModule, level: AccessLevel) {
    playSound("blip");
    onChange({ role, access: { ...access, modules: { ...access.modules, [module]: level } } });
  }

  return (
    <div className="grid gap-4" data-testid="access-editor">
      <div className="grid gap-2" role="radiogroup" aria-label="Perfil de partida">
        <p className="text-xs font-bold tracking-[0.1em] text-fg-muted uppercase">Perfil de partida</p>
        {STAFF_ROLES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={role === option}
            disabled={disabled}
            onClick={() => onChange({ role: option, access: ROLE_PRESETS[option] })}
            className={cn(
              "rounded-xl border-2 border-line-strong bg-surface-2 p-3 text-left transition-[border-color,background-color] disabled:opacity-50",
              role === option && "border-red bg-brand-soft",
            )}
            data-testid={`role-${option}`}
          >
            <span className="block text-sm font-bold text-fg">{ROLE_LABEL[option]}</span>
            <span className="block text-xs text-fg-muted">{ROLE_DESCRIPTION[option]}</span>
          </button>
        ))}
      </div>

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
            >
              <Reload className="size-3.5" /> Voltar ao perfil
            </button>
          </div>
        ) : (
          <span className="text-xs text-fg-dim">Iguais às do perfil</span>
        )}
      </div>

      {ACCESS_GROUPS.map((group) => (
        <fieldset key={group.title} className="grid gap-2" disabled={disabled}>
          <legend className="pixel mb-1 text-[0.5rem] tracking-[0.12em] text-fg-dim uppercase">{group.title}</legend>
          {group.modules.map((module) => {
            const info = MODULE_INFO[module];
            const level = access.modules[module];
            const hint = level === "edit" ? info.edit : level === "view" ? info.view : null;
            return (
              <div key={module} className="rounded-xl border border-line bg-surface-2 p-3" data-testid={`access-${module}`}>
                <p className="text-sm font-bold text-fg">{info.label}</p>
                <div className={cn("mt-2 grid gap-1.5", info.levels.length === 3 ? "grid-cols-3" : "grid-cols-2")} role="radiogroup" aria-label={info.label}>
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
                          "flex min-h-10 items-center justify-center gap-1.5 rounded-lg border-2 px-1.5 text-xs font-bold transition-[color,background-color,border-color,transform] active:scale-95",
                          selected ? LEVEL_TONE[option] : "border-transparent bg-surface text-fg-muted hover:text-fg",
                        )}
                        data-testid={`access-${module}-${option}`}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        {option === "view" && info.levels.length === 2 ? "Ver" : option === "edit" && info.levels.length === 2 ? "Acessar" : ACCESS_LEVEL_LABEL[option]}
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
    </div>
  );
}
