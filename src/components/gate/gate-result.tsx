"use client";

import { motion } from "motion/react";
import {
  Building,
  Cancel,
  Check,
  Clock,
  Gift,
  Human,
  Info,
  Loader,
  Login,
  type PixelIcon,
  Reload,
  Shield,
  Teach,
  Users,
  Warning,
} from "@/components/icons/pixel";
import { PixelTag, PlayerTag } from "@/components/retro/bits";
import { ScrollHint } from "@/components/retro/scroll-hint";
import { AffiliationBadge, ToneBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { AFFILIATION_STATUS_LABEL, CHECK_IN_METHOD_LABEL, EMPLOYEE_CATEGORY_INLINE, EMPLOYEE_CATEGORY_LABEL, EMPLOYEE_CATEGORY_TITLE } from "@/domain/labels";
import { formatShortDateTime, formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { EntryKitResult } from "@/server/services/checkin";
import type { GateView, KitView } from "@/server/services/gate-view";

type Tone = "success" | "warning" | "danger";

function headerFor(view: GateView, justCheckedIn: boolean): { tone: Tone; icon: PixelIcon; kicker: string; title: string; detail?: string } {
  if (justCheckedIn && view.entry.kind === "ALREADY_IN") {
    return { tone: "success", icon: Check, kicker: "1UP", title: "ENTRADA CONFIRMADA", detail: `Registrada às ${formatTime(view.entry.at)}.` };
  }
  switch (view.entry.kind) {
    case "ALLOWED":
      return {
        tone: "success",
        icon: Shield,
        kicker: "Ready",
        title: "LIBERADO PARA ENTRADA",
        detail:
          view.entry.role === "EMPLOYEE"
            ? `${EMPLOYEE_CATEGORY_TITLE[view.employee?.category ?? "STAFF"]}${view.employee?.jobTitle ? ` · ${view.employee.jobTitle}` : ""}`
            : view.entry.role === "GUEST"
            ? `Convidado(a) de ${view.host?.fullName ?? "professor(a)"}${view.host?.kind === "EMPLOYEE" ? ` (${EMPLOYEE_CATEGORY_INLINE[view.host.category ?? "STAFF"]})` : ""}`
            : view.ownRegistration
              ? `${view.ownRegistration.isTeacher ? "Professor(a)" : "Filiado(a)"} · ${AFFILIATION_STATUS_LABEL[view.ownRegistration.status]}`
              : undefined,
      };
    case "ALREADY_IN":
      return {
        tone: "warning",
        icon: Reload,
        kicker: "Continue?",
        title: "ENTRADA JÁ REGISTRADA",
        detail: `Em ${formatShortDateTime(view.entry.at)} por ${view.entry.byName} (${CHECK_IN_METHOD_LABEL[view.entry.method]}).`,
      };
    case "BLOCKED": {
      const soft = ["MEMBER_PENDING", "HOST_PENDING", "MEMBER_AWAITING_SIGNATURE"].includes(view.entry.code);
      return {
        tone: soft ? "warning" : "danger",
        icon: soft ? Clock : Cancel,
        kicker: "Stop",
        title: view.entry.title.toUpperCase(),
        detail: view.entry.detail,
      };
    }
  }
}

const TONE: Record<Tone, string> = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-white hazard",
};

export function KitStatusText({ kit }: { kit: KitView }) {
  if (kit.kind === "DELIVERED") {
    return (
      <span className="font-semibold text-success-text">
        Entregue {formatShortDateTime(kit.at)} · {kit.byName}
      </span>
    );
  }
  if (kit.kind === "AVAILABLE") return <span className="font-bold text-red">Não saiu na entrada: entregar agora</span>;
  return <span className="text-fg-muted">{kit.message}</span>;
}

function InfoRow({ icon: Icon, label, children }: { icon: PixelIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-2/70 px-3.5 py-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-fg-dim" />
      <div className="min-w-0 flex-1">
        <dt className="text-[0.68rem] font-bold tracking-[0.1em] text-fg-dim uppercase">{label}</dt>
        <dd className="mt-0.5 text-sm leading-snug text-fg">{children}</dd>
      </div>
    </div>
  );
}

/** "Sem kit: o estoque acabou." → "O estoque acabou." (ou "o estoque acabou." no meio da frase). */
function reasonText(message: string, midSentence = false) {
  const text = message.replace(/^Sem kit: /, "");
  const first = midSentence ? text.charAt(0).toLowerCase() : text.charAt(0).toUpperCase();
  return first + text.slice(1);
}

/** Texto do botão de entrada: já diz quantos kits saem junto. */
export function confirmEntryLabel(view: GateView) {
  const kit = view.kitOnEntry;
  if (kit?.kind !== "WILL_DELIVER") return "Confirmar entrada";
  return kit.count === 2 ? "Confirmar entrada + 2 kits" : "Confirmar entrada + kit";
}

/** Quantos kits a recepção entrega agora (0, 1 ou 2). */
export function deliveredKitCount(kit: EntryKitResult | null, guestKit: EntryKitResult | null) {
  return (kit?.kind === "DELIVERED" ? 1 : 0) + (guestKit?.kind === "DELIVERED" ? 1 : 0);
}

/** Resultado dos kits na hora da entrada: a recepção vê de longe quantos entregar. */
function EntryKitBanner({ kit, guestKit }: { kit: EntryKitResult; guestKit: EntryKitResult | null }) {
  const count = deliveredKitCount(kit, guestKit);
  const waiting = kit.kind === "WAITING";
  const lines: string[] = [];
  if (kit.kind === "DELIVERED") {
    lines.push(
      kit.kitType === "GUEST"
        ? `Kit de convidado para ${kit.beneficiaryName}.`
        : kit.kitType === "EMPLOYEE"
          ? "Kit de colaborador(a) (estoque dos colaboradores)."
          : "Kit de consumação do(a) professor(a).",
    );
  } else {
    lines.push(count > 0 ? `Kit de quem chegou: ${reasonText(kit.message, true)}` : reasonText(kit.message));
  }
  if (guestKit?.kind === "DELIVERED") {
    lines.push(`Kit do convidado ${guestKit.beneficiaryName}, que já entrou: entregue para levar a ele(a).`);
  } else if (guestKit) {
    lines.push(`Kit do convidado: ${reasonText(guestKit.message, true)}`);
  }
  const lowest = [kit, guestKit]
    .filter((k): k is Extract<EntryKitResult, { kind: "DELIVERED" }> => k?.kind === "DELIVERED" && k.low)
    .map((k) => k.available);
  if (lowest.length > 0) lines.push(`Atenção: restam ${Math.min(...lowest)} no estoque.`);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.15 }}
      className={cn(
        "relative mt-4 flex items-center gap-3 rounded-xl px-4 py-3",
        count > 0 ? "bg-ink/85 text-white shadow-[0_0_30px_-8px_rgb(255_255_255/0.5)]" : "bg-black/20",
      )}
      data-testid="entry-kit-result"
    >
      <span
        className={cn(
          "relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg",
          count > 0 ? "bg-red text-white shadow-[0_3px_0_0_var(--brand-strong)]" : "bg-black/20",
        )}
      >
        {count > 0 ? <Gift className="size-7" /> : waiting ? <Clock className="size-6" /> : <Info className="size-6" />}
        {count === 2 ? (
          <span className="pixel absolute -top-2 -right-2 rounded-md bg-white px-1 py-0.5 text-[0.55rem] text-red shadow">x2</span>
        ) : null}
      </span>
      <div className="min-w-0">
        <p className="display text-2xl leading-none">
          {count === 2 ? "Entregue 2 kits!" : count === 1 ? "Entregue 1 kit!" : waiting ? "Kit fica para depois" : "Sem kit"}
        </p>
        {lines.map((line) => (
          <p key={line} className="mt-1 text-sm font-semibold opacity-90">
            {line}
          </p>
        ))}
      </div>
    </motion.div>
  );
}

/** Resultado da leitura na portaria: faixa de status grande, bem legível à distância. */
export function GateResult({
  view,
  justCheckedIn = false,
  entryKit = null,
  entryGuestKit = null,
  confirming = false,
  onConfirm,
  hintClassName,
}: {
  view: GateView;
  justCheckedIn?: boolean;
  /** O que aconteceu com o kit na entrada que acabou de ser confirmada. */
  entryKit?: EntryKitResult | null;
  /** Na chegada de quem convidou: o kit do convidado que já tinha entrado. */
  entryGuestKit?: EntryKitResult | null;
  confirming?: boolean;
  onConfirm?: () => void;
  /** Posição da seta "tem mais embaixo" (ex.: acima da barra do leitor). */
  hintClassName?: string;
}) {
  const header = headerFor(view, justCheckedIn);
  const own = view.ownRegistration;
  const isGuest = view.role === "GUEST";
  const isEmployee = view.role === "EMPLOYEE";
  // No celular, o botão de entrada ou a solução do bloqueio podem ficar abaixo da tela: a seta leva até lá.
  const canConfirm = Boolean(onConfirm) && view.permissions.checkIn && view.entry.kind === "ALLOWED";
  const canResolve = view.entry.kind === "BLOCKED" && view.permissions.validateAffiliation;

  return (
    <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_24px_60px_-28px_rgb(0_0_0/0.95)]" data-testid="gate-result">
      <motion.div
        key={header.title}
        initial={{ opacity: 0.4, scaleY: 0.85 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn("relative origin-top px-5 py-5 sm:px-6", TONE[header.tone])}
        role="status"
        aria-live="assertive"
      >
        <div className="flex items-center gap-4">
          <motion.span
            key={`${header.title}-icon`}
            initial={{ scale: 0.3, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 16 }}
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl bg-black/15"
          >
            <header.icon className="size-9" />
          </motion.span>
          <div className="min-w-0">
            <p className="pixel text-[0.55rem] opacity-80">{header.kicker}</p>
            <p className="display mt-1 text-[2.1rem] leading-[0.95] sm:text-5xl" data-testid="gate-status-title">
              {header.title}
            </p>
          </div>
        </div>
        {header.detail ? <p className="mt-3 text-sm font-bold opacity-95">{header.detail}</p> : null}
        {justCheckedIn && entryKit ? <EntryKitBanner kit={entryKit} guestKit={entryGuestKit} /> : null}
        {justCheckedIn ? (
          <motion.span
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], y: -40 }}
            transition={{ duration: 1.4 }}
            className="pixel pointer-events-none absolute top-4 right-5 text-lg"
            aria-hidden
          >
            1UP
          </motion.span>
        ) : null}
      </motion.div>

      <div className="space-y-4 p-4 sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {isEmployee ? (
              <PixelTag tone="warning">{EMPLOYEE_CATEGORY_LABEL[view.employee?.category ?? "STAFF"]}</PixelTag>
            ) : view.role !== "NONE" ? (
              <PlayerTag player={isGuest ? 2 : 1} />
            ) : null}
            {own && !isGuest && own.isTeacher ? <PixelTag tone="red">Professor(a)</PixelTag> : null}
            {view.isMinor ? (
              <ToneBadge tone="warning" icon={Warning} size="lg" className="animate-pulse">
                MENOR DE 18
              </ToneBadge>
            ) : null}
          </div>
          <p className="display mt-3 text-4xl break-words text-fg sm:text-5xl" data-testid="gate-person-name">
            {view.fullName}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-xs text-fg-muted">
            <span>{view.hasCpf ? `CPF ${view.cpf}` : "Sem CPF"}</span>
            {view.voucherCode ? <span>· {view.voucherCode}</span> : null}
          </p>
        </div>

        <dl className="grid gap-2">
          {view.employee ? (
            <InfoRow icon={Building} label={EMPLOYEE_CATEGORY_TITLE[view.employee.category]}>
              <span className="font-bold">{view.employee.jobTitle ?? "Setor não informado"}</span>
              {view.employee.active ? (
                <>
                  <span className="mt-1 block">
                    Seu kit: <KitStatusText kit={view.employee.kits.EMPLOYEE} />
                  </span>
                  <span className="mt-1 block">
                    Kit do convidado
                    {view.employee.kits.GUEST.kind === "DELIVERED"
                      ? ` (${view.employee.kits.GUEST.beneficiaryName})`
                      : view.employee.guest
                        ? ` (${view.employee.guest.fullName})`
                        : ""}
                    : <KitStatusText kit={view.employee.kits.GUEST} />
                  </span>
                  {view.kitDeadline ? (
                    <span className={cn("mt-1.5 block text-xs font-bold", view.kitDeadline.passed ? "text-danger" : "text-fg-muted")}>
                      {view.kitDeadline.passed ? "Horário de entregar kits encerrado" : `Kits até ${formatTime(view.kitDeadline.at)}`}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="mt-1 block font-semibold text-danger">Fora da lista de colaboradores</span>
              )}
            </InfoRow>
          ) : null}

          {isGuest && view.host ? (
            <InfoRow icon={Users} label={view.host.kind === "EMPLOYEE" ? "Colaborador(a) que convidou" : "Professor(a) responsável"}>
              <span className="font-bold">{view.host.fullName}</span>
              <span className="mt-1.5 flex flex-wrap gap-2">
                {view.host.status ? (
                  <AffiliationBadge status={view.host.status} short />
                ) : (
                  <ToneBadge tone={view.host.active ? "warning" : "danger"} icon={Building}>
                    {view.host.active ? EMPLOYEE_CATEGORY_TITLE[view.host.category ?? "STAFF"] : "Fora da lista"}
                  </ToneBadge>
                )}
                <ToneBadge tone={view.host.checkedIn ? "success" : "neutral"} icon={Login}>
                  {view.host.checkedIn ? "Já entrou" : "Ainda não entrou"}
                </ToneBadge>
              </span>
            </InfoRow>
          ) : null}

          {own ? (
            <InfoRow icon={own.isTeacher ? Teach : Human} label={isGuest ? "Filiação própria" : "Filiação"}>
              <AffiliationBadge status={own.status} />
              {own.isTeacher && view.entry.kind !== "ALREADY_IN" ? (
                <span className="mt-1.5 block text-xs font-bold text-warning" data-testid="teacher-check-reminder">
                  Declarou ser professor(a): confira os dados antes de confirmar a entrada.
                </span>
              ) : null}
            </InfoRow>
          ) : null}

          <InfoRow icon={Login} label="Entrada">
            {view.entry.kind === "ALREADY_IN" ? (
              <span className="font-bold text-success-text">Registrada {formatShortDateTime(view.entry.at)}</span>
            ) : (
              <span className="text-fg-muted">Ainda não registrada</span>
            )}
          </InfoRow>

          {own && !isGuest ? (
            <InfoRow icon={Gift} label="Kits de consumação (saem na entrada)">
              {own.isTeacher ? (
                <>
                  <span className="block">
                    Seu kit: <KitStatusText kit={own.kits.MEMBER} />
                  </span>
                  <span className="mt-1 block">
                    Kit do convidado
                    {own.kits.GUEST.kind === "DELIVERED" ? ` (${own.kits.GUEST.beneficiaryName})` : own.guest ? ` (${own.guest.fullName})` : ""}:{" "}
                    <KitStatusText kit={own.kits.GUEST} />
                  </span>
                  {view.kitDeadline ? (
                    <span className={cn("mt-1.5 block text-xs font-bold", view.kitDeadline.passed ? "text-danger" : "text-fg-muted")}>
                      {view.kitDeadline.passed ? "Horário de entregar kits encerrado" : `Kits até ${formatTime(view.kitDeadline.at)}`}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-fg-muted">Sem kit — exclusivo para professoras e professores.</span>
              )}
            </InfoRow>
          ) : null}

          {isGuest && view.guestKit ? (
            <InfoRow icon={Gift} label="Kit de consumação do convidado">
              {view.guestKit.delivered && view.guestKit.deliveredAt ? (
                <span className="font-bold text-success-text">Entregue {formatShortDateTime(view.guestKit.deliveredAt)}.</span>
              ) : view.guestKit.deliveredForOther ? (
                <span className="text-fg-muted">O kit de convidado deste grupo já foi entregue a outra pessoa.</span>
              ) : view.host && !view.host.checkedIn ? (
                <span className="font-semibold text-fg">
                  Sai quando <strong>{view.host.fullName}</strong> chegar
                  {view.entry.kind === "ALREADY_IN" ? ": entregue junto com a entrada dele(a), para levar ao convidado." : "."}
                </span>
              ) : view.entry.kind === "ALREADY_IN" ? (
                <span className="font-semibold text-fg">
                  Não saiu na entrada. Se ainda houver direito, entregue pelo cadastro de {view.host?.fullName ?? "quem convidou"}.
                </span>
              ) : (
                <span className="text-fg-muted">Sai junto com a entrada deste convidado.</span>
              )}
            </InfoRow>
          ) : null}

          {view.pastGuestLinks.some((p) => p.status === "CONVERTED") ? (
            <InfoRow icon={Reload} label="Histórico">
              Convidado(a) originalmente por <strong>{view.pastGuestLinks.find((p) => p.status === "CONVERTED")?.hostName}</strong>;
              passou a ser filiado(a).
            </InfoRow>
          ) : null}
        </dl>

        {onConfirm && view.permissions.checkIn ? (
          view.entry.kind === "ALLOWED" ? (
            <div className="space-y-2">
              {view.kitOnEntry ? (
                <p
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-bold",
                    view.kitOnEntry.kind === "WILL_DELIVER"
                      ? "border-red/50 bg-brand-soft text-fg"
                      : "border-line-strong bg-surface-2 text-fg-muted",
                  )}
                  data-testid="kit-on-entry"
                >
                  {view.kitOnEntry.kind === "WILL_DELIVER" ? (
                    <>
                      <Gift className="size-6 shrink-0 animate-bounce text-red motion-reduce:animate-none" />
                      <span>
                        Na entrada, entregue <span className="text-red">{view.kitOnEntry.label}</span>.
                      </span>
                    </>
                  ) : (
                    <>
                      {view.kitOnEntry.kind === "WAITING" ? <Clock className="size-5 shrink-0" /> : <Info className="size-5 shrink-0" />}
                      <span>{view.kitOnEntry.message}</span>
                    </>
                  )}
                </p>
              ) : null}
              <Button
                type="button"
                variant="success"
                size="xl"
                onClick={onConfirm}
                disabled={confirming}
                className="w-full text-lg min-[380px]:text-xl sm:text-2xl"
                id="confirm-entry"
                data-testid="confirm-entry"
              >
                {confirming ? <Loader className="animate-spin-steps" /> : <Login />}
                {confirmEntryLabel(view)}
              </Button>
            </div>
          ) : view.entry.kind === "BLOCKED" ? (
            <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm font-semibold text-fg">
              <Warning className="mt-0.5 size-4 shrink-0 text-danger" />
              Entrada bloqueada. {view.permissions.validateAffiliation ? "Resolva abaixo ou pelo Atendimento." : "Encaminhe ao Atendimento."}
            </p>
          ) : null
        ) : null}
      </div>
      {canConfirm && !justCheckedIn ? (
        <ScrollHint
          key={`confirmar-${view.personId}`}
          targetId="confirm-entry"
          label={confirmEntryLabel(view)}
          className={hintClassName}
          block="center"
        />
      ) : null}
      {canResolve ? (
        <ScrollHint key={`resolver-${view.personId}`} targetId="person-operations" label="Resolver abaixo" className={hintClassName} />
      ) : null}
    </div>
  );
}
