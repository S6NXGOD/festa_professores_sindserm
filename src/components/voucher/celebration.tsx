"use client";

import confetti from "canvas-confetti";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { playSound } from "@/lib/sound";

/** Chuva de confete "pixelado" (quadrados) nas cores do sindicato, só ao concluir a inscrição. */
export function Celebration({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;
    // Remove o marcador da URL (sem nova renderização) para não repetir ao recarregar.
    window.history.replaceState(null, "", pathname);
    playSound("fanfare");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#ff2626", "#e3000f", "#ffffff", "#f3e8d4", "#8c0008"];
    const shoot = (originX: number, angle: number) =>
      confetti({
        particleCount: 80,
        spread: 70,
        startVelocity: 48,
        angle,
        origin: { x: originX, y: 0.72 },
        colors,
        shapes: ["square"],
        scalar: 1.05,
        ticks: 200,
        flat: true,
      });
    shoot(0.08, 60);
    shoot(0.92, 120);
    const timer = window.setTimeout(
      () => confetti({ particleCount: 70, spread: 110, origin: { y: 0.35 }, colors, shapes: ["square"], ticks: 180, flat: true }),
      380,
    );
    return () => window.clearTimeout(timer);
  }, [enabled, pathname]);

  return null;
}
