"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Lista de fila animada: ao resolver um item, a página recarrega os dados do
 * servidor e só a diferença anima — o item resolvido sai deslizando e os
 * próximos sobem para o lugar dele. As chaves vêm explícitas (e não dos
 * elementos filhos) porque o conteúdo é renderizado no servidor.
 */
export function AnimatedList({ items, className }: { items: { key: string; content: React.ReactNode }[]; className?: string }) {
  return (
    <ul className={cn("space-y-3", className)}>
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.li
            key={item.key}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 56, transition: { duration: 0.22 } }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            {item.content}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
