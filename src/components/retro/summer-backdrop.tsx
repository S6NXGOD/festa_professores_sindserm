import { cn } from "@/lib/utils";

/**
 * Cenário de verão atrás do conteúdo (festa das servidoras e servidores), nas
 * cores da logo "Quem luta também se diverte": o sol se pondo na água, ondas
 * passando devagar, gaivotas atravessando o céu, bolhas subindo, uma bola de
 * praia flutuando e a silhueta de um coqueiro. Só CSS (sem JavaScript) e
 * respeita "reduzir movimento" do sistema.
 *
 * - "stage": páginas públicas (com o sol).
 * - "hero": como "stage", sem o sol (a página já tem a arte da festa).
 * - "calm": área da equipe (só as ondas, discretas, para não competir com os dados).
 */
export function SummerBackdrop({ variant = "stage", className }: { variant?: "stage" | "hero" | "calm"; className?: string }) {
  const stage = variant !== "calm";
  return (
    <div aria-hidden className={cn("no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}>
      {/* brilho do pôr do sol no horizonte */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0",
          stage
            ? "h-[62vh] bg-[radial-gradient(85%_60%_at_50%_100%,rgb(255_120_40/0.36),rgb(232_25_31/0.14)_45%,transparent_72%)]"
            : "h-[40vh] bg-[radial-gradient(70%_60%_at_50%_100%,rgb(255_120_40/0.13),transparent_70%)]",
        )}
      />
      {variant === "stage" ? (
        <div className="absolute bottom-[17vh] left-1/2 w-[min(66vw,360px)] -translate-x-1/2">
          <div className="retro-sun aspect-square w-full animate-sun-glow opacity-90" />
        </div>
      ) : null}

      <Waves stage={stage} />

      {stage ? (
        <>
          <Gulls />
          <BeachBall className="top-[13%] right-[6%] size-14 animate-float [--float-rotate:14deg] sm:size-16" />
          <Palm className="bottom-[16vh] -left-10 w-44 text-[#5c1218] opacity-90 sm:w-56" />
          <Sparkle className="top-[9%] left-[12%] size-5 animate-twinkle text-[#ffd23a]" />
          <Sparkle className="top-[44%] left-[8%] size-3 animate-twinkle text-[#8fdcff] [animation-delay:-2.2s]" />
          <Bubbles count={7} />
        </>
      ) : (
        <Bubbles count={3} />
      )}
    </div>
  );
}

const WAVES = [
  { color: "rgb(28 184 242 / 0.30)", duration: "38s", lift: "0%", reverse: false },
  { color: "rgb(10 111 209 / 0.30)", duration: "27s", lift: "26%", reverse: true },
  { color: "rgb(9 18 46 / 0.92)", duration: "20s", lift: "48%", reverse: false },
] as const;

/** Mar (ou piscina): três ondas em camadas, cada uma no seu ritmo. */
function Waves({ stage }: { stage: boolean }) {
  return (
    <div className={cn("absolute inset-x-0 bottom-0", stage ? "h-[24vh]" : "h-[13vh] opacity-60")}>
      {WAVES.map((wave) => (
        <div key={wave.color} className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: wave.lift }}>
          <div
            className="flex h-full w-[200%] animate-wave-drift"
            style={{ animationDuration: wave.duration, animationDirection: wave.reverse ? "reverse" : "normal" }}
          >
            {[0, 1].map((copy) => (
              <svg key={copy} viewBox="0 0 1200 120" preserveAspectRatio="none" className="h-full w-1/2" fill={wave.color}>
                <path d="M0 52 Q 150 0 300 52 T 600 52 T 900 52 T 1200 52 V120 H0 Z" />
              </svg>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const GULLS = [
  { top: "11%", width: 26, duration: "44s", delay: "-6s" },
  { top: "17%", width: 18, duration: "52s", delay: "-24s" },
  { top: "8%", width: 14, duration: "60s", delay: "-38s" },
] as const;

/** Gaivotas da logo atravessando o céu, batendo as asas. */
function Gulls() {
  return (
    <>
      {GULLS.map((gull) => (
        <div
          key={gull.top}
          className="absolute left-0 animate-fly"
          style={{ top: gull.top, animationDuration: gull.duration, animationDelay: gull.delay }}
        >
          <svg viewBox="0 0 24 10" style={{ width: gull.width }} className="animate-flap text-[#fff3dc]/75" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 7 Q 6 1 12 7 Q 18 1 23 7" />
          </svg>
        </div>
      ))}
    </>
  );
}

/** Bolhas subindo da água, cada uma no seu tempo. */
function Bubbles({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="absolute bottom-[-2rem] animate-bubble rounded-full border border-white/35 bg-white/10"
          style={{
            left: `${8 + ((index * 37) % 84)}%`,
            width: `${10 + ((index * 7) % 14)}px`,
            height: `${10 + ((index * 7) % 14)}px`,
            animationDelay: `${-index * 2.3}s`,
            animationDuration: `${12 + ((index * 5) % 9)}s`,
          }}
        />
      ))}
    </>
  );
}

/** Bola de praia em gomos, nas cores da logo. */
function BeachBall({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("absolute drop-shadow-[0_6px_14px_rgb(0_0_0/0.35)]", className)}>
      <circle cx="32" cy="32" r="30" fill="#fff3dc" />
      <path d="M32 2a30 30 0 0 1 26 15L32 32Z" fill="#f23c1c" />
      <path d="M58 17a30 30 0 0 1 0 30L32 32Z" fill="#ffd23a" />
      <path d="M58 47a30 30 0 0 1-26 15V32Z" fill="#1cb8f2" />
      <path d="M32 62A30 30 0 0 1 6 47l26-15Z" fill="#f23c1c" />
      <path d="M6 47a30 30 0 0 1 0-30l26 15Z" fill="#ffd23a" />
      <path d="M6 17A30 30 0 0 1 32 2v30Z" fill="#1cb8f2" />
      <circle cx="32" cy="32" r="6" fill="#fff3dc" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth="2" />
    </svg>
  );
}

/** Silhueta de coqueiro (o vinho dos coqueiros da logo). */
function Palm({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 260" className={cn("absolute", className)} fill="currentColor">
      <path d="M96 256c6-48 10-96 4-150l10 1c8 56 2 104-4 149Z" />
      <path d="M104 104c-22-30-58-40-94-30 30 2 58 12 78 36Z" />
      <path d="M104 104c-10-34-36-58-70-66 26 12 46 34 56 70Z" />
      <path d="M106 102c8-36 34-60 72-64-28 12-50 34-60 68Z" />
      <path d="M106 104c26-26 60-30 92-18-32 0-62 10-84 30Z" />
      <path d="M104 106c-30-6-62 6-84 30 26-12 54-18 80-14Z" />
      <circle cx="104" cy="110" r="7" />
      <circle cx="114" cy="114" r="6" />
    </svg>
  );
}

/** Brilho de quatro pontas (estrela do fim de tarde). */
function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("absolute", className)} fill="currentColor">
      <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12Z" />
    </svg>
  );
}
