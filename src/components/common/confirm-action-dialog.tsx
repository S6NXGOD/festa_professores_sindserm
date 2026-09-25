"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { callAction } from "@/lib/call-action";
import { playSound, type SoundName } from "@/lib/sound";

/**
 * Confirmação antes de operações sensíveis ou destrutivas. Opcionalmente pede
 * uma justificativa (obrigatória em correções administrativas).
 */
export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  tone = "default",
  justification,
  justificationLabel = "Justificativa",
  children,
  onConfirm,
  onDone,
  successMessage,
  sound,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger" | "success";
  justification?: "required" | "optional";
  justificationLabel?: string;
  children?: React.ReactNode;
  onConfirm: (text: string) => Promise<ActionResult<unknown>>;
  onDone?: () => void;
  successMessage?: string;
  /** Efeito sonoro ao concluir (portaria/entregas). */
  sound?: SoundName;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const tooShort = justification === "required" && text.trim().length < 10;

  function confirm() {
    startTransition(async () => {
      const result = await callAction(onConfirm(text.trim()));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        return;
      }
      if (sound) playSound(sound);
      if (successMessage) toast.success(successMessage);
      setOpen(false);
      setText("");
      onDone?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {justification ? (
          <label className="grid gap-2 text-[0.78rem] font-bold tracking-[0.08em] text-fg-muted uppercase">
            {justificationLabel}
            {justification === "optional" ? <span className="-mt-1 text-xs font-medium tracking-normal normal-case text-fg-dim">Opcional</span> : null}
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              maxLength={500}
              className="font-sans text-base tracking-normal normal-case"
              placeholder={justification === "required" ? "Descreva o motivo (mínimo de 10 caracteres)" : ""}
            />
          </label>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={tone === "success" ? "success" : "default"}
            onClick={confirm}
            disabled={pending || tooShort}
            data-testid="confirm-dialog-action"
          >
            {pending ? <Loader className="animate-spin-steps" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
