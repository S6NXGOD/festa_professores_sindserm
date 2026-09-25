"use client";

import { motion, type HTMLMotionProps } from "motion/react";

/** Entrada suave (fade + leve deslocamento) para blocos de conteúdo. */
export function Reveal({
  delay = 0,
  y = 14,
  children,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
