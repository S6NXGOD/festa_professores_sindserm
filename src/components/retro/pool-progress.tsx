"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Título da piscina (os assistentes passam o lado da fita dos anos 80). */
const POOL_TITLE: Record<string, string> = { "LADO A": "Inscrição", "LADO B": "Ficha de filiação", SETUP: "Configuração" };

/**
 * Piscina como barra de progresso (tema verão, no lugar da fita cassete):
 * vista de cima, com as cordas das raias e uma boia que nada até a etapa
 * atual. As etapas ficam marcadas na faixa do fundo da raia do meio.
 */
export function PoolProgress({
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
  const id = useId();
  const last = Math.max(steps.length - 1, 1);
  const markX = (index: number) => 34 + (152 * index) / last;
  const current = Math.min(Math.max(step, 0), steps.length - 1);

  return (
    <div className={cn("w-full", className)}>
      <div className="relative mx-auto w-full max-w-sm">
        <div className="mb-1.5 flex items-center justify-between px-1 text-fg-muted">
          <span className="pixel text-[0.55rem]">{POOL_TITLE[label] ?? label}</span>
          <span className="pixel text-[0.55rem]">{`${current + 1}/${steps.length}`}</span>
        </div>
        <svg
          viewBox="0 0 220 112"
          className="w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
          role="img"
          aria-label={`Etapa ${current + 1} de ${steps.length}: ${steps[current]}`}
        >
          <defs>
            <linearGradient id={`${id}-agua`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3fe3d6" />
              <stop offset="1" stopColor="#1a7cff" />
            </linearGradient>
            <pattern id={`${id}-azulejo`} width="11" height="11" patternUnits="userSpaceOnUse">
              <path d="M11 0H0V11" fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="1" />
            </pattern>
          </defs>
          {/* borda de pedra e a água, com o azulejo do fundo */}
          <rect x="2" y="2" width="216" height="108" rx="14" fill="#ffe8c2" stroke="#e9c48c" strokeWidth="2" />
          <rect x="11" y="11" width="198" height="90" rx="8" fill={`url(#${id}-agua)`} />
          <rect x="11" y="11" width="198" height="90" rx="8" fill={`url(#${id}-azulejo)`} />
          {/* faixa do fundo da raia do meio, com a marca de cada etapa */}
          <line x1={markX(0)} x2={markX(last)} y1="56" y2="56" stroke="#0b3f8f" strokeOpacity="0.45" strokeWidth="4" strokeLinecap="round" />
          {steps.map((name, index) => (
            <circle
              key={name}
              cx={markX(index)}
              cy="56"
              r="5"
              fill={index <= current ? "#ffd24a" : "#0b3f8f"}
              fillOpacity={index <= current ? 1 : 0.6}
              stroke="#fff9f0"
              strokeWidth={index === current ? 1.5 : 0}
            />
          ))}
          <Rope y={41} />
          <Rope y={71} />
          {/* reflexos do sol na água */}
          <path
            d="M28 24q8-4 16 0t16 0M156 90q8-4 16 0t16 0"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.5"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="animate-twinkle"
          />
          {/* A boia nada até a etapa atual (a animação respeita "reduzir movimento"). */}
          <motion.g initial={false} animate={{ x: markX(current) }} transition={{ type: "spring", stiffness: 110, damping: 15 }}>
            <ellipse cx="1.5" cy="59" rx="11" ry="4" fill="#0a1630" opacity="0.22" />
            <g className="animate-bob">
              <FloatRing cx={0} cy={56} />
              <circle cx="-3.5" cy="51.5" r="1.6" fill="#fff" opacity="0.85" />
            </g>
          </motion.g>
        </svg>
      </div>
      <ol className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((name, index) => (
          <li
            key={name}
            className={cn(
              "flex flex-col items-center gap-1 text-center",
              index === current ? "text-fg" : index < current ? "text-red" : "text-fg-dim",
            )}
            aria-current={index === current ? "step" : undefined}
          >
            <span className="pixel text-[0.55rem]">{`RAIA ${index + 1}`}</span>
            <span className="text-xs leading-tight font-semibold">{name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Corda da raia: boias pequenas, vermelhas e brancas. */
function Rope({ y }: { y: number }) {
  return (
    <g>
      <line x1="13" x2="207" y1={y} y2={y} stroke="#fff" strokeOpacity="0.45" strokeWidth="0.8" />
      {Array.from({ length: 28 }, (_, index) => (
        <circle key={index} cx={15 + index * 7.1} cy={y} r="2.4" fill={index % 2 ? "#fff9f0" : "#ff5233"} />
      ))}
    </g>
  );
}

/** Boia de anel (gomos vermelhos e brancos), girando devagar. */
function FloatRing({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "center" }} className="animate-reel">
      <circle cx={cx} cy={cy} r="7.8" fill="none" stroke="#fff9f0" strokeWidth="6.4" />
      <circle cx={cx} cy={cy} r="7.8" fill="none" stroke="#ff5233" strokeWidth="6.4" strokeDasharray="6.13 6.13" />
      <circle cx={cx} cy={cy} r="11" fill="none" stroke="#0a1630" strokeOpacity="0.25" strokeWidth="0.8" />
    </g>
  );
}

/** Carregando (tema verão): a boia girando na água e "CARREGANDO" piscando. */
export function FloatLoader({ label = "Carregando", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 text-fg-muted", className)}>
      <svg viewBox="0 0 64 32" className="w-20" aria-hidden>
        <path d="M0 23q8-5 16 0t16 0t16 0t16 0V32H0Z" fill="#1fd6c9" fillOpacity="0.55" />
        <g className="animate-bob">
          <FloatRing cx={32} cy={15} />
        </g>
        <path d="M0 26q8-5 16 0t16 0t16 0t16 0V32H0Z" fill="#2e78ff" fillOpacity="0.75" />
      </svg>
      <span className="pixel text-[0.6rem]">
        {label}
        <span className="animate-blink">_</span>
      </span>
    </div>
  );
}
