import Link from "next/link";
import { Hourglass } from "@/components/icons/pixel";
import { ToneBadge } from "@/components/status/status-badge";
import { formatShortDateTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import type { WaitingSlot } from "@/server/services/kit-waitlist";
import { AdvanceWaitlistButton } from "./advance-waitlist-button";
import { Panel } from "./panel-ui";

/**
 * Fila do kit: quem se inscreveu depois que os kits acabaram, na ordem em que
 * vai ganhar o kit se vagar. No estoque separado, cada kit tem a sua fila.
 */
export function KitWaitlistPanel({
  queue,
  shared,
  canPeople,
  canAdvance,
}: {
  queue: WaitingSlot[];
  shared: boolean;
  canPeople: boolean;
  canAdvance: boolean;
}) {
  if (queue.length === 0) return null;
  const counters = new Map<string, number>();
  const rows = queue.map((slot) => {
    const line = shared ? "ALL" : slot.kitType;
    const position = (counters.get(line) ?? 0) + 1;
    counters.set(line, position);
    return { slot, position };
  });

  return (
    <Panel
      title="Fila do kit"
      icon={Hourglass}
      action={canAdvance ? <AdvanceWaitlistButton /> : null}
    >
      <div data-testid="kit-waitlist">
        <p className="mb-3 text-sm text-fg-muted">
          {plural(queue.length, "kit esperando", "kits esperando")}: inscrições feitas depois que os kits acabaram. Vagou kit (inscrição
          recusada ou estoque aumentado), a fila anda sozinha, nesta ordem. Sobrou kit na festa? Na portaria, abra a pessoa e toque em{" "}
          <strong className="text-fg">Entregar kit de sobra</strong>.
        </p>
        <ol className="divide-y divide-line">
          {rows.map(({ slot, position }) => (
            <li key={`${slot.registrationId}-${slot.kitType}`} className="flex items-center gap-3 py-2.5" data-testid="kit-waitlist-row">
              <span className="pixel w-8 shrink-0 text-[0.6rem] text-warning tabular">{String(position).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">
                  {slot.kitType === "MEMBER" ? (
                    canPeople ? (
                      <Link href={`/painel/participantes/${slot.memberPersonId}`} className="hover:text-red">
                        {slot.memberName}
                      </Link>
                    ) : (
                      slot.memberName
                    )
                  ) : canPeople && slot.guestPersonId ? (
                    <Link href={`/painel/participantes/${slot.guestPersonId}`} className="hover:text-red">
                      {slot.guestName}
                    </Link>
                  ) : (
                    slot.guestName
                  )}
                </p>
                <p className="truncate text-xs text-fg-muted">
                  {slot.kitType === "MEMBER" ? "Kit do(a) professor(a)" : `Kit de convidado · de ${slot.memberName}`}
                  {shared ? "" : slot.kitType === "MEMBER" ? " · fila dos professores" : " · fila dos convidados"} · desde{" "}
                  {formatShortDateTime(slot.since)}
                </p>
              </div>
              {/* A conferência é da inscrição de quem convidou: o selo fica só na linha dele(a). */}
              {slot.kitType === "MEMBER" && (slot.status === "PENDING" || slot.status === "AWAITING_SIGNATURE") ? (
                <ToneBadge tone="warning">{slot.status === "PENDING" ? "Conferir" : "Assinar ficha"}</ToneBadge>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}
