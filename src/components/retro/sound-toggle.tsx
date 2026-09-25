"use client";

import { Volume, VolumeOff } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { playSound, setSoundEnabled, useSoundEnabled } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Liga/desliga os sons 8-bit (fica lembrado neste aparelho). */
export function SoundToggle({ className }: { className?: string }) {
  const on = useSoundEnabled();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("text-fg-muted hover:text-fg", className)}
      onClick={() => {
        setSoundEnabled(!on);
        if (!on) playSound("coin");
      }}
      aria-label={on ? "Desligar os sons" : "Ligar os sons"}
      aria-pressed={on}
      title={on ? "Sons ligados" : "Sons desligados"}
      data-testid="sound-toggle"
    >
      {on ? <Volume /> : <VolumeOff />}
    </Button>
  );
}
