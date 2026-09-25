"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Login } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";

/**
 * Celular: a inscrição sempre ao alcance do polegar. A barra aparece quando o
 * botão principal (`targetId`) sai da tela e some quando ele volta, para não
 * haver dois botões iguais à vista.
 */
export function StickyCta({ targetId, caption }: { targetId: string; caption?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShow(!entry!.isIntersecting), { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="sticky-cta"
          initial={{ y: "110%" }}
          animate={{ y: 0 }}
          exit={{ y: "110%" }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-strong bg-ink/92 px-4 pt-3 backdrop-blur sm:hidden"
          data-testid="sticky-cta"
        >
          <Button asChild size="lg" className="w-full">
            <Link href="/inscricao">
              <Login /> Fazer minha inscrição <ArrowRight />
            </Link>
          </Button>
          {caption ? <p className="mt-1.5 text-center text-[0.7rem] font-semibold text-fg-muted">{caption}</p> : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
