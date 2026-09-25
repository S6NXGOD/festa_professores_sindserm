import { Check, ClipboardNote, Clock, Close, Login, type PixelIcon, Sparkles, Teach } from "@/components/icons/pixel";
import {
  AFFILIATION_STATUS_LABEL,
  AFFILIATION_STATUS_SHORT,
  AFFILIATION_STATUS_TONE,
  type StatusTone,
} from "@/domain/labels";
import type { AffiliationStatus } from "@/domain/types";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "border-success/45 bg-success-soft text-success-text",
  warning: "border-warning/45 bg-warning-soft text-warning",
  danger: "border-danger/50 bg-danger-soft text-danger",
  info: "border-red/45 bg-brand-soft text-fg",
  neutral: "border-line-strong bg-surface-3 text-fg-muted",
};

/** Selo de estado (como os indicadores de um painel de som). */
export function ToneBadge({
  tone,
  icon: Icon,
  children,
  className,
  size = "sm",
}: {
  tone: StatusTone;
  icon?: PixelIcon;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border font-bold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon ? <Icon className={size === "sm" ? "size-3.5" : "size-4"} /> : null}
      {children}
    </span>
  );
}

const STATUS_ICON: Record<AffiliationStatus, PixelIcon> = {
  PENDING: Clock,
  AWAITING_SIGNATURE: ClipboardNote,
  CONFIRMED: Check,
  REJECTED: Close,
  JOINED_AT_EVENT: Sparkles,
};

export function AffiliationBadge({
  status,
  short = false,
  size = "sm",
  className,
}: {
  status: AffiliationStatus;
  short?: boolean;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <ToneBadge tone={AFFILIATION_STATUS_TONE[status]} icon={STATUS_ICON[status]} size={size} className={className}>
      {short ? AFFILIATION_STATUS_SHORT[status] : AFFILIATION_STATUS_LABEL[status]}
    </ToneBadge>
  );
}

export function TeacherBadge({ isTeacher, className }: { isTeacher: boolean; className?: string }) {
  return isTeacher ? (
    <ToneBadge tone="info" icon={Teach} className={className}>
      Professor(a)
    </ToneBadge>
  ) : (
    <ToneBadge tone="neutral" className={className}>
      Não professor(a)
    </ToneBadge>
  );
}

export function EntryBadge({ checkedIn, label }: { checkedIn: boolean; label?: string }) {
  return checkedIn ? (
    <ToneBadge tone="success" icon={Login}>
      {label ?? "Presente"}
    </ToneBadge>
  ) : (
    <ToneBadge tone="neutral">{label ?? "Aguardando entrada"}</ToneBadge>
  );
}
