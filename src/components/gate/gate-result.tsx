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
import { PlayerTag } from "@/components/retro/bits";
import { ScrollHint } from "@/components/retro/scroll-hint";
import { CATEGORY_STYLE } from "@/components/staff/employee-category";
import { AffiliationBadge, ToneBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { AFFILIATION_STATUS_LABEL, CHECK_IN_METHOD_LABEL, EMPLOYEE_CATEGORY_INLINE, EMPLOYEE_CATEGORY_TITLE } from "@/domain/labels";
import { formatShortDateTime, formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { EntryKitResult } from "@/server/services/checkin";
import type { GateView, KitOnEntry, KitView } from "@/server/services/gate-view";
import { Disclosure } from "./disclosure";

type Tone = "success" | "warning" | "danger";

function headerFor(view: GateView, justCheckedIn: boolean): { tone: Tone; icon: PixelIcon; kicker: string; title: string; detail?: string } {
  if (justCheckedIn && view.entry.kind === "ALREADY_IN") {
    return { tone: "success", icon: Check, kicker: "1UP", title: "ENTRADA CONFIRMADA", detail: `Registrada às ${formatTime(view.entry.at)}.` };
  }
  switch (view.entry.kind) {
    case "ALLOWED":
      // Quem é a pessoa vem logo abaixo do nome: a faixa fica curta e a decisão cabe na tela.
      return { tone: "success", icon: Shield, kicker: "Ready", title: "LIBERADO PARA ENTRADA" };
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

/** Quem é a pessoa na festa, numa linha: "Professor(a) · Filiação confirmada", "Convidado(a) de ...". */
function roleLine(view: GateView): { icon: PixelIcon; iconClass: string; text: string } | null {
  if (view.employee && (view.role === "EMPLOYEE" || view.role === "NONE")) {
    const style = CATEGORY_STYLE[view.employee.category];
    return {
      icon: style.icon,
      iconClass: style.text,
      text: `${EMPLOYEE_CATEGORY_TITLE[view.employee.category]}${view.employee.jobTitle ? ` · ${view.employee.jobTitle}` : ""}`,
    };
  }
  if (view.role === "GUEST" && view.host) {
    return {
      icon: Users,
      iconClass: "text-fg-muted",
      text: `Convidado(a) de ${view.host.fullName}${view.host.kind === "EMPLOYEE" ? ` (${EMPLOYEE_CATEGORY_INLINE[view.host.category ?? "STAFF"]})` : ""}`,
    };
  }
  const own = view.ownRegistration;
  if (own) {
    return {
      icon: own.isTeacher ? Teach : Human,
      iconClass: own.isTeacher ? "text-red" : "text-fg-muted",
      text: `${own.isTeacher ? "Professor(a)" : "Filiado(a)"} · ${AFFILIATION_STATUS_LABEL[own.status]}`,
    };
  }
  return null;
}

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

/** A entrada pode ser confirmada agora, por quem está com o aparelho? */
export function canConfirmEntry(view: GateView) {
  return view.permissions.checkIn && view.entry.kind === "ALLOWED";
}

/** Quantos kits a recepção entrega agora (0, 1 ou 2). */
export function deliveredKitCount(kit: EntryKitResult | null, guestKit: EntryKitResult | null) {
  return (kit?.kind === "DELIVERED" ? 1 : 0) + (guestKit?.kind === "DELIVERED" ? 1 : 0);
}

/**
 * Botão verde de confirmar a entrada. Em duas linhas ("Confirmar entrada" e
 * "+ 2 kits"): cabe inteiro até nos celulares mais estreitos.
 */
export function ConfirmEntryButton({
  view,
  confirming,
  onConfirm,
  className,
}: {
  view: GateView;
  confirming: boolean;
  onConfirm: () => void;
  className?: string;
}) {
  const kit = view.kitOnEntry;
  const extra = kit?.kind === "WILL_DELIVER" ? (kit.count === 2 ? "2 kits" : "kit") : null;
  return (
    <Button
      type="button"
      variant="success"
      size="xl"
      onClick={onConfirm}
      disabled={confirming}
      className={cn("h-auto min-h-16 flex-col justify-center gap-1 py-2.5", className)}
      id="confirm-entry"
      data-testid="confirm-entry"
    >
      <span className="flex items-center gap-2.5 text-xl leading-none min-[400px]:text-2xl">
        {confirming ? <Loader className="animate-spin-steps" /> : <Login />}
        Confirmar entrada
      </span>{" "}
      {extra ? (
        <span className="pixel flex items-center gap-1.5 text-[0.55rem] leading-none opacity-90">
          <Gift className="size-3.5" />+ {extra}
        </span>
      ) : null}
    </Button>
  );
}

/**
 * O que sai de kit com esta entrada, em destaque: a recepção já separa o kit
 * enquanto confirma.
 */
export function KitOnEntryTile({
  kit,
  deadline,
  className,
  testId = "kit-on-entry",
}: {
  kit: KitOnEntry;
  deadline?: GateView["kitDeadline"];
  className?: string;
  testId?: string;
}) {
  if (kit.kind === "WILL_DELIVER") {
    return (
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.08 }}
        className={cn(
          "flex items-center gap-3.5 rounded-xl border border-red/60 bg-brand-soft px-3.5 py-3 shadow-[0_0_30px_-16px_var(--glow)]",
          className,
        )}
        data-testid={testId}
      >
        <span className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-red text-white shadow-[0_3px_0_0_var(--brand-strong)]">
          <Gift className="size-7" />
          {kit.count === 2 ? (
            <span className="pixel absolute -top-2 -right-2 rounded-md bg-white px-1 py-0.5 text-[0.55rem] text-red shadow">x2</span>
          ) : null}
        </span>
        <div className="min-w-0">
          <p className="pixel text-[0.5rem] text-red">Na entrada</p>
          <p className="display mt-0.5 text-[1.65rem] leading-none text-fg">Entregue {kit.count === 2 ? "2 kits" : "1 kit"}</p>
          <p className="mt-1 text-sm leading-snug text-fg-muted">
            {kit.detail}
            {deadline && !deadline.passed ? <span className="whitespace-nowrap"> · até {formatTime(deadline.at)}</span> : null}
          </p>
        </div>
      </motion.div>
    );
  }
  const waiting = kit.kind === "WAITING";
  const reason = waiting ? kit.message : reasonText(kit.message);
  return (
    <div className={cn("flex items-center gap-3.5 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-3", className)} data-testid={testId}>
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-muted">
        {waiting ? <Clock className="size-7" /> : <Info className="size-7" />}
      </span>
      <div className="min-w-0">
        <p className="pixel text-[0.5rem] text-fg-dim">{waiting ? "Kit do convidado" : "Kit"}</p>
        <p className="display mt-0.5 text-[1.65rem] leading-none text-fg">{waiting ? "Fica para depois" : "Sem kit"}</p>
        {reason !== "Sem kit." ? <p className="mt-1 text-sm leading-snug text-fg-muted">{reason}</p> : null}
      </div>
    </div>
  );
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
        "relative mt-3 flex items-center gap-3 rounded-xl px-4 py-3",
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

/** Filiação, quem convidou, kits e histórico: o "por quê" de cada status. */
function DetailRows({ view }: { view: GateView }) {
  const own = view.ownRegistration;
  const isGuest = view.role === "GUEST";
  const deadline = view.kitDeadline ? (
    <span className={cn("mt-1.5 block text-xs font-bold", view.kitDeadline.passed ? "text-danger" : "text-fg-muted")}>
      {view.kitDeadline.passed ? "Horário de entregar kits encerrado" : `Kits até ${formatTime(view.kitDeadline.at)}`}
    </span>
  ) : null;

  return (
    <dl className="grid gap-2">
      {view.employee ? (
        <InfoRow icon={Building} label={`Kits · ${EMPLOYEE_CATEGORY_TITLE[view.employee.category]}`}>
          {view.employee.active ? (
            <>
              <span className="block">
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
              {deadline}
            </>
          ) : (
            <span className="block font-semibold text-danger">Fora da lista de colaboradores</span>
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
        </InfoRow>
      ) : null}

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
              {deadline}
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
          Convidado(a) originalmente por <strong>{view.pastGuestLinks.find((p) => p.status === "CONVERTED")?.hostName}</strong>; passou a
          ser filiado(a).
        </InfoRow>
      ) : null}
    </dl>
  );
}

/**
 * Resultado da leitura na portaria: faixa de status grande, nome, quem a pessoa
 * é e o que sai de kit — o suficiente para decidir de relance.
 *
 * `mode="gate"` (portaria): o botão de entrada fica numa barra fixa, fora do
 * cartão (quem usa passa `onConfirm` só no painel), e enquanto a pessoa está
 * liberada os detalhes ficam recolhidos. `mode="panel"`: tudo aberto.
 */
export function GateResult({
  view,
  justCheckedIn = false,
  entryKit = null,
  entryGuestKit = null,
  confirming = false,
  onConfirm,
  mode = "panel",
  hintClassName,
}: {
  view: GateView;
  justCheckedIn?: boolean;
  /** O que aconteceu com o kit na entrada que acabou de ser confirmada. */
  entryKit?: EntryKitResult | null;
  /** Na chegada de quem convidou: o kit do convidado que já tinha entrado. */
  entryGuestKit?: EntryKitResult | null;
  confirming?: boolean;
  /** Botão de entrada dentro do cartão (painel). Na portaria, o botão fica na barra fixa. */
  onConfirm?: () => void;
  mode?: "gate" | "panel";
  /** Posição da seta "tem mais embaixo" (ex.: acima da barra do leitor). */
  hintClassName?: string;
}) {
  const header = headerFor(view, justCheckedIn);
  const own = view.ownRegistration;
  const role = roleLine(view);
  const allowed = view.entry.kind === "ALLOWED";
  const deciding = allowed && !justCheckedIn;
  // Na portaria o cartão mostra só o essencial; os detalhes abrem sozinhos só para quem já entrou
  // (é quando se consulta o que saiu de kit). Bloqueado: a faixa já diz o motivo e o que fazer.
  const quick = mode === "gate" && (allowed || justCheckedIn || view.entry.kind === "BLOCKED");
  const inlineConfirm = Boolean(onConfirm) && canConfirmEntry(view) && !justCheckedIn;
  const canResolve = view.entry.kind === "BLOCKED" && view.permissions.validateAffiliation;
  const teacherCheck = Boolean(own?.isTeacher) && view.role === "MEMBER" && deciding;

  return (
    <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_24px_60px_-28px_rgb(0_0_0/0.95)]" data-testid="gate-result">
      <motion.div
        key={header.title}
        initial={{ opacity: 0.4, scaleY: 0.85 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn("relative origin-top px-4 py-3.5 sm:px-6 sm:py-5", TONE[header.tone])}
        role="status"
        aria-live="assertive"
      >
        <div className="flex items-center gap-3">
          <motion.span
            key={`${header.title}-icon`}
            initial={{ scale: 0.3, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 16 }}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-black/15 sm:size-14"
          >
            <header.icon className="size-7 sm:size-9" />
          </motion.span>
          <div className="min-w-0">
            <p className="pixel text-[0.5rem] opacity-80">{header.kicker}</p>
            <p className="display mt-0.5 text-[1.75rem] leading-[0.92] min-[400px]:text-[2rem] sm:text-5xl" data-testid="gate-status-title">
              {header.title}
            </p>
          </div>
        </div>
        {header.detail ? <p className="mt-2 text-sm font-bold opacity-95">{header.detail}</p> : null}
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

      <div className="space-y-3 p-4 sm:space-y-4 sm:p-6">
        <div>
          {view.role !== "NONE" || view.isMinor ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {view.role === "EMPLOYEE" && view.employee ? (
                <span
                  className={cn(
                    "pixel inline-flex items-center rounded-[4px] border px-1.5 py-1 text-[0.55rem] leading-none",
                    CATEGORY_STYLE[view.employee.category].chip,
                  )}
                >
                  Da casa
                </span>
              ) : view.role !== "NONE" ? (
                <PlayerTag player={view.role === "GUEST" ? 2 : 1} />
              ) : null}
              {view.isMinor ? (
                <ToneBadge tone="warning" icon={Warning} size="lg" className="animate-pulse">
                  MENOR DE 18
                </ToneBadge>
              ) : null}
            </div>
          ) : null}
          <p className="display text-[2.15rem] leading-[0.95] break-words text-fg sm:text-5xl" data-testid="gate-person-name">
            {view.fullName}
          </p>
          {role ? (
            <p className="mt-2 flex items-start gap-2 text-[0.95rem] leading-snug font-semibold text-fg" data-testid="gate-person-role">
              <role.icon className={cn("mt-0.5 size-4 shrink-0", role.iconClass)} />
              <span className="min-w-0">{role.text}</span>
            </p>
          ) : null}
          <p className="mt-1.5 flex flex-wrap gap-x-2 font-mono text-xs text-fg-muted">
            <span>{view.hasCpf ? `CPF ${view.cpf}` : "Sem CPF"}</span>
            {view.voucherCode ? <span>· {view.voucherCode}</span> : null}
          </p>
        </div>

        {deciding && view.kitOnEntry ? <KitOnEntryTile kit={view.kitOnEntry} deadline={view.kitDeadline} /> : null}

        {teacherCheck ? (
          <p
            className="flex items-start gap-2 rounded-lg border border-warning/45 bg-warning-soft px-3 py-2.5 text-sm font-semibold text-warning"
            data-testid="teacher-check-reminder"
          >
            <Warning className="mt-0.5 size-4 shrink-0" />
            Declarou ser professor(a): confira antes de confirmar.
          </p>
        ) : null}

        {view.entry.kind === "BLOCKED" && view.permissions.checkIn && view.permissions.validateAffiliation ? (
          <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm font-semibold text-fg">
            <Warning className="mt-0.5 size-4 shrink-0 text-danger" />
            Entrada bloqueada: resolva abaixo ou pelo Atendimento.
          </p>
        ) : null}

        {inlineConfirm ? <ConfirmEntryButton view={view} confirming={confirming} onConfirm={onConfirm!} className="w-full" /> : null}

        {mode === "gate" ? (
          <Disclosure
            key={quick ? "rapido" : "aberto"}
            title="Detalhes"
            hint={own ? "Filiação, kits e convidado" : view.employee ? "Kits e convidado" : "Quem convidou e kit"}
            defaultOpen={!quick}
            testId="gate-details"
          >
            <DetailRows view={view} />
          </Disclosure>
        ) : (
          <DetailRows view={view} />
        )}
      </div>
      {inlineConfirm ? (
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
