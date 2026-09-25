"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Fita cassete como barra de progresso: a fita passa do carretel da esquerda
 * para o da direita conforme as etapas avançam, e os carretéis giram.
 */
export function CassetteProgress({
  step,
  steps,
  label = "LADO A",
  className,
}: {
  /** Etapa atual (0 = primeira). */
  step: number;
  steps: string[];
  label?: string;
  className?: string;
}) {
  const progress = steps.length > 1 ? step / (steps.length - 1) : 1;
  // Raio da fita enrolada em cada carretel (fita "passa" da esquerda para a direita).
  const leftTape = 15 - 8 * progress;
  const rightTape = 7 + 8 * progress;

  return (
    <div className={cn("w-full", className)}>
      <div className="relative mx-auto w-full max-w-sm">
        <svg viewBox="0 0 220 130" className="w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]" role="img" aria-label={`Etapa ${step + 1} de ${steps.length}: ${steps[step]}`}>
          {/* corpo */}
          <rect x="2" y="2" width="216" height="126" rx="12" fill="#161618" stroke="#34343a" strokeWidth="2" />
          <rect x="12" y="10" width="196" height="76" rx="6" fill="#f3e8d4" />
          <rect x="12" y="24" width="196" height="8" fill="#e3000f" />
          <rect x="12" y="34" width="196" height="3" fill="#e3000f" opacity="0.6" />
          <text x="22" y="20" fontSize="8" fontWeight="800" fill="#17120d" fontFamily="var(--font-saira)" letterSpacing="1">
            {label}
          </text>
          <text x="198" y="20" fontSize="8" fontWeight="800" fill="#17120d" textAnchor="end" fontFamily="var(--font-saira)">
            {`${step + 1}/${steps.length}`}
          </text>
          {/* janela dos carretéis */}
          <rect x="44" y="42" width="132" height="36" rx="18" fill="#0b0b0c" stroke="#2c2c31" strokeWidth="2" />
          {/* fita enrolada */}
          <motion.circle cx="78" cy="60" fill="#3a2a1e" initial={false} animate={{ r: leftTape }} transition={{ duration: 0.6 }} />
          <motion.circle cx="142" cy="60" fill="#3a2a1e" initial={false} animate={{ r: rightTape }} transition={{ duration: 0.6 }} />
          {/* A animação respeita "reduzir movimento" via CSS (sem divergência na hidratação). */}
          <Reel cx={78} cy={60} />
          <Reel cx={142} cy={60} />
          {/* parte de baixo */}
          <path d="M40 128 52 100h116l12 28" fill="#101012" stroke="#2c2c31" strokeWidth="2" />
          <circle cx="70" cy="114" r="4" fill="#26262b" />
          <circle cx="150" cy="114" r="4" fill="#26262b" />
          <circle cx="110" cy="112" r="3" fill="#26262b" />
        </svg>
      </div>
      <ol className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((name, index) => (
          <li
            key={name}
            className={cn(
              "flex flex-col items-center gap-1 text-center",
              index === step ? "text-fg" : index < step ? "text-red" : "text-fg-dim",
            )}
            aria-current={index === step ? "step" : undefined}
          >
            <span className="pixel text-[0.55rem]">{`FAIXA ${index + 1}`}</span>
            <span className="text-xs leading-tight font-semibold">{name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Reel({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g style={{ transformOrigin: `${cx}px ${cy}px` }} className="animate-reel">
      <circle cx={cx} cy={cy} r="7" fill="#f3e8d4" />
      <circle cx={cx} cy={cy} r="2.4" fill="#0b0b0c" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <rect
          key={deg}
          x={cx - 1}
          y={cy - 7}
          width="2"
          height="3"
          fill="#0b0b0c"
          transform={`rotate(${deg} ${cx} ${cy})`}
        />
      ))}
    </g>
  );
}

/** Indicador de carregamento: carretéis girando e "CARREGANDO" piscando. */
export function CassetteLoader({ label = "Carregando", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 text-fg-muted", className)}>
      <svg viewBox="0 0 64 28" className="w-20" aria-hidden>
        <rect x="1" y="1" width="62" height="26" rx="13" fill="#0b0b0c" stroke="#34343a" strokeWidth="2" />
        <g style={{ transformOrigin: "18px 14px" }} className="animate-reel">
          <circle cx="18" cy="14" r="8" fill="#f3e8d4" />
          <circle cx="18" cy="14" r="2.5" fill="#0b0b0c" />
          <rect x="17" y="6" width="2" height="4" fill="#0b0b0c" />
          <rect x="17" y="18" width="2" height="4" fill="#0b0b0c" />
        </g>
        <g style={{ transformOrigin: "46px 14px" }} className="animate-reel">
          <circle cx="46" cy="14" r="8" fill="#f3e8d4" />
          <circle cx="46" cy="14" r="2.5" fill="#0b0b0c" />
          <rect x="45" y="6" width="2" height="4" fill="#0b0b0c" />
          <rect x="45" y="18" width="2" height="4" fill="#0b0b0c" />
        </g>
      </svg>
      <span className="pixel text-[0.6rem]">
        {label}
        <span className="animate-blink">_</span>
      </span>
    </div>
  );
}
