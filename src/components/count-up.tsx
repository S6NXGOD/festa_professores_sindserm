"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

const numberFormat = new Intl.NumberFormat("pt-BR");

/** Número que "conta" até o valor final de forma discreta. */
export function CountUp({ value, duration = 0.9, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = Number(node.dataset.current ?? 0);
    if (reduce || from === value) {
      node.dataset.current = String(value);
      node.textContent = numberFormat.format(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        node.textContent = numberFormat.format(Math.round(latest));
      },
      onComplete: () => {
        node.dataset.current = String(value);
      },
    });
    return () => {
      controls.stop();
      node.textContent = numberFormat.format(value);
    };
  }, [value, duration, reduce]);

  return (
    <span ref={ref} className={className} data-current="0" aria-label={numberFormat.format(value)}>
      {numberFormat.format(0)}
    </span>
  );
}
