"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Cancel, Check, Clock, Users } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { EDITION } from "@/domain/edition";
import { plural } from "@/lib/plural";
import { confirmPendingInBulkAction } from "@/server/actions/operations";

/**
 * Sem tempo de conferir todo mundo (decisão da organização: é melhor não barrar
 * quem é filiado(a)): confirma de uma vez quem está na fila até a hora em que a
 * tela abriu. Quem o SINDSERM descobrir depois que não é filiado(a) é desfeito(a)
 * na página da pessoa ("Não é filiado(a)").
 */
export function BulkConfirmPending({ count, upTo }: { count: number; upTo: string }) {
  const router = useRouter();
  const result = useRef<{ confirmed: number; stillPending: number } | null>(null);

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid="bulk-confirm-box"
    >
      <p className="flex items-start gap-2 text-sm text-fg-muted">
        <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          Não vai dar tempo de conferir as {count}? Confirme todas de uma vez: ninguém que é filiado(a) fica de fora.
        </span>
      </p>
      <ConfirmActionDialog
        trigger={
          <Button variant="outline" className="w-full shrink-0 sm:w-auto" data-testid="bulk-confirm-pending">
            <Check /> Confirmar todas ({count})
          </Button>
        }
        title={`Confirmar as ${count} sem conferir?`}
        description="Use quando não der tempo de conferir todo mundo. É mais rápido, mas alguém que não é filiado(a) pode entrar junto."
        confirmLabel={`Confirmar as ${count}`}
        tone="success"
        sound="fanfare"
        onConfirm={async () => {
          const response = await confirmPendingInBulkAction({ upTo });
          if (response.ok) result.current = response.data;
          return response;
        }}
        onDone={() => {
          const done = result.current;
          if (done) {
            toast.success(
              `${plural(done.confirmed, "inscrição confirmada", "inscrições confirmadas")}.${
                done.stillPending ? ` ${plural(done.stillPending, "chegou depois e continua", "chegaram depois e continuam")} na fila.` : ""
              }`,
            );
          }
          router.refresh();
        }}
      >
        <ul className="grid gap-2.5 text-sm text-fg" data-testid="bulk-confirm-terms">
          <li className="flex items-start gap-2">
            <Users className="mt-0.5 size-4 shrink-0 text-success-text" />
            <span>
              As {count} pessoas (e os convidados delas) passam a poder entrar e receber o kit
              {EDITION.sharedKit ? " (um por inscrição, para os dois)" : ""}.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <span>Quem se inscrever depois que você abriu esta tela continua na fila.</span>
          </li>
          <li className="flex items-start gap-2">
            <Cancel className="mt-0.5 size-4 shrink-0 text-danger" />
            <span>
              Se o SINDSERM constatar depois que alguém não é filiado(a), abra a pessoa e toque em <strong>Não é filiado(a)</strong>: ela
              não entra nem recebe o kit.
            </span>
          </li>
        </ul>
        <p className="text-xs text-fg-muted">Cada uma fica marcada como &quot;confirmada em massa, sem conferência&quot;, na pessoa e na Auditoria.</p>
      </ConfirmActionDialog>
    </div>
  );
}
