import { formatDateTime } from "@/lib/datetime";
import { AUDIT_ACTIONS, type AuditAction } from "@/server/services/audit";

export interface AuditEntryView {
  id: number;
  action: string;
  actorLabel: string;
  summary: string;
  createdAt: Date;
}

export function auditActionLabel(action: string) {
  return AUDIT_ACTIONS[action as AuditAction] ?? action;
}

/** Linha do tempo de auditoria (somente leitura). */
export function AuditTimeline({ entries, empty = "Sem registros." }: { entries: AuditEntryView[]; empty?: string }) {
  if (entries.length === 0) return <p className="text-sm text-fg-muted">{empty}</p>;
  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-5">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute top-1.5 -left-[27px] size-3 rounded-[3px] bg-red shadow-[0_0_8px_var(--red)] ring-4 ring-ink" aria-hidden />
          <p className="text-xs text-fg-dim tabular">
            {formatDateTime(entry.createdAt)} · {entry.actorLabel}
          </p>
          <p className="text-sm font-bold text-fg">{auditActionLabel(entry.action)}</p>
          <p className="text-sm text-fg-muted">{entry.summary}</p>
        </li>
      ))}
    </ol>
  );
}
