"use client";

import { AlarmClock, Login, Loader } from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "faltam 3 dias" / "faltam 2h10" / "falta 1 minuto". */
export function timeUntil(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const minutes = Math.ceil((new Date(iso).getTime() - now) / 60_000);
  if (minutes <= 0) return null;
  if (minutes >= 48 * 60) return `faltam ${Math.floor(minutes / (24 * 60))} dias`;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `faltam ${h}h${m ? String(m).padStart(2, "0") : ""}`;
  }
  return minutes === 1 ? "falta 1 minuto" : `faltam ${minutes} minutos`;
}

/**
 * A regra da festa: entrada só a partir do horário de início. Antes disso, a
 * portaria vê este aviso e só registra se confirmar (fica na auditoria).
 */
export function EarlyEntryDialog({
  open,
  name,
  startLabel,
  startAt,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  name: string;
  startLabel: string | null;
  startAt: string | null;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const remaining = timeUntil(startAt);
  return (
    <Dialog open={open} onOpenChange={(value) => !value && !pending && onCancel()}>
      <DialogContent data-testid="early-entry-dialog">
        <DialogHeader>
          <PixelTag tone="warning" className="w-fit">
            <AlarmClock className="size-3.5" /> Ainda não abriu
          </PixelTag>
          <DialogTitle>A festa ainda não começou</DialogTitle>
          <DialogDescription>
            Começa {startLabel ?? "no horário marcado"}
            {remaining ? ` (${remaining})` : ""}. A regra é registrar entradas só a partir desse horário.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-fg">
          Registrar a entrada de <strong>{name}</strong> mesmo assim? Os kits saem normalmente e fica anotado na auditoria que a entrada foi antes
          do horário.
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="border-warning/60 text-warning hover:border-warning hover:text-warning"
            onClick={onConfirm}
            disabled={pending}
            data-testid="early-entry-confirm"
          >
            {pending ? <Loader className="animate-spin-steps" /> : <Login />} Registrar mesmo assim
          </Button>
          <Button type="button" variant="light" onClick={onCancel} disabled={pending} autoFocus>
            Esperar o horário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
