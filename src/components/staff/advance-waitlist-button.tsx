"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Loader, Reload } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { callAction } from "@/lib/call-action";
import { plural } from "@/lib/plural";
import { playSound } from "@/lib/sound";
import { advanceKitWaitlistAction } from "@/server/actions/operations";

/** A fila anda sozinha; este botão confere agora se há kit sem dono para os próximos. */
export function AdvanceWaitlistButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      data-testid="advance-kit-waitlist"
      onClick={() =>
        startTransition(async () => {
          const result = await callAction(advanceKitWaitlistAction());
          if (!result.ok) {
            playSound("error");
            toast.error(result.error);
            return;
          }
          if (result.data.promoted > 0) {
            playSound("powerup");
            toast.success(`${plural(result.data.promoted, "kit saiu", "kits saíram")} da fila: agora estão garantidos.`);
          } else {
            playSound("blip");
            toast("Nenhum kit vago agora: a fila anda sozinha quando vagar.");
          }
          router.refresh();
        })
      }
    >
      {pending ? <Loader className="animate-spin-steps" /> : <Reload />} Andar a fila
    </Button>
  );
}
