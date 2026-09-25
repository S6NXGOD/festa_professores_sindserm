"use client";

import { motion } from "motion/react";
import { Clock, Gift, Info, Login } from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GateView } from "@/server/services/gate-view";
import { confirmEntryLabel } from "./gate-result";

/**
 * Logo depois de confirmar a filiação (ou a assinatura da ficha) na portaria:
 * "já pode entrar!" com o botão de registrar a entrada na frente, para a equipe
 * não esquecer esse segundo passo.
 */
export function EntryPromptDialog({
  view,
  open,
  onConfirm,
  onClose,
}: {
  view: GateView;
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const first = view.fullName.split(" ")[0];
  const kit = view.kitOnEntry;
  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md" data-testid="entry-prompt">
        <DialogHeader>
          <motion.div initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 14 }}>
            <PixelTag tone="success" className="w-fit">
              Ready
            </PixelTag>
          </motion.div>
          <DialogTitle>{first} já pode entrar!</DialogTitle>
          <DialogDescription>A filiação está confirmada. Registre a entrada agora para não ficar pendente.</DialogDescription>
        </DialogHeader>
        {kit ? (
          <p
            className={
              kit.kind === "WILL_DELIVER"
                ? "flex items-center gap-2.5 rounded-xl border border-red/50 bg-brand-soft px-4 py-3 text-sm font-bold text-fg"
                : "flex items-center gap-2.5 rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-sm font-semibold text-fg-muted"
            }
          >
            {kit.kind === "WILL_DELIVER" ? (
              <>
                <Gift className="size-6 shrink-0 animate-bounce text-red motion-reduce:animate-none" />
                <span>
                  Na entrada, entregue <span className="text-red">{kit.label}</span>.
                </span>
              </>
            ) : (
              <>
                {kit.kind === "WAITING" ? <Clock className="size-5 shrink-0" /> : <Info className="size-5 shrink-0" />}
                {kit.message}
              </>
            )}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Agora não
          </Button>
          <Button type="button" variant="success" size="lg" autoFocus onClick={onConfirm} data-testid="prompt-confirm-entry">
            <Login /> {confirmEntryLabel(view)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
