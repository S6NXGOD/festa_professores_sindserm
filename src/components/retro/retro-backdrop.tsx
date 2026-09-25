import { cn } from "@/lib/utils";

/**
 * Cenário anos 80 atrás do conteúdo: sol listrado, chão quadriculado em
 * perspectiva e formas geométricas flutuando. Só CSS (sem JavaScript) e
 * respeita "reduzir movimento" do sistema.
 *
 * - "stage": páginas públicas (mais presença, com o sol listrado).
 * - "hero": como "stage", sem o sol (a página já tem o cartaz da festa, que tem o próprio sol).
 * - "calm": área da equipe (discreto, para não competir com os dados).
 */
export function RetroBackdrop({ variant = "stage", className }: { variant?: "stage" | "hero" | "calm"; className?: string }) {
  const stage = variant !== "calm";
  return (
    <div aria-hidden className={cn("no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}>
      {/* brilho vermelho no horizonte */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0",
          stage ? "h-[46vh] bg-[radial-gradient(80%_60%_at_50%_100%,rgb(255_38_38/0.24),transparent_70%)]" : "h-[30vh] bg-[radial-gradient(70%_60%_at_50%_100%,rgb(255_38_38/0.1),transparent_70%)]",
        )}
      />
      {variant === "stage" ? (
        <div className="absolute bottom-[26vh] left-1/2 w-[min(70vw,380px)] -translate-x-1/2">
          <div className="retro-sun aspect-square w-full animate-sun-glow opacity-80" />
        </div>
      ) : null}
      <div className={cn("absolute inset-x-[-60%] bottom-0", stage ? "h-[30vh]" : "h-[22vh] opacity-40")}>
        <div className="retro-floor h-full w-full" />
      </div>
      {/* linha do horizonte */}
      <div className={cn("absolute inset-x-0 h-px neon-line", stage ? "bottom-[30vh]" : "bottom-[22vh] opacity-40")} />

      {stage ? (
        <>
          <Triangle className="top-[12%] left-[6%] size-10 animate-float text-red [--float-rotate:-12deg]" />
          <Triangle className="top-[38%] right-[7%] size-7 animate-float text-white/70 [--float-rotate:18deg] [animation-delay:-2s]" />
          <Zigzag className="top-[22%] right-[12%] w-16 animate-float text-red/80 [animation-delay:-4s]" />
          <Zigzag className="bottom-[40%] left-[4%] w-12 animate-float text-white/40 [animation-delay:-1s]" />
          <div className="halftone absolute -top-10 -right-10 size-56 rounded-full opacity-40 [mask-image:radial-gradient(circle,#000_30%,transparent_70%)]" />
          <div className="halftone-white absolute bottom-[34vh] -left-16 size-44 rounded-full opacity-50 [mask-image:radial-gradient(circle,#000_25%,transparent_70%)]" />
        </>
      ) : (
        <div className="halftone absolute -top-24 -right-24 size-72 rounded-full opacity-20 [mask-image:radial-gradient(circle,#000_20%,transparent_70%)]" />
      )}
    </div>
  );
}

function Triangle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 36" className={cn("absolute", className)} fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 3 37 33H3Z" />
    </svg>
  );
}

function Zigzag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 16" className={cn("absolute", className)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="miter">
      <path d="M2 12 10 4l8 8 8-8 8 8 8-8 8 8 8-8" />
    </svg>
  );
}
