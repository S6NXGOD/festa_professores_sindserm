"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useEffect, useState } from "react";
import { Whatsapp } from "@/components/icons/pixel";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/*
 * Ajuda pelo WhatsApp da organização (número configurado no painel). Sem
 * número configurado, nada aparece.
 */

interface HelpContact {
  phone: string | null;
  eventName: string;
}

const HelpContext = createContext<HelpContact>({ phone: null, eventName: "" });

export function HelpProvider({ phone, eventName, children }: HelpContact & { children: React.ReactNode }) {
  return <HelpContext.Provider value={{ phone, eventName }}>{children}</HelpContext.Provider>;
}

export function helpMessage(eventName: string, topic?: string) {
  const festa = eventName || "Festa das Professoras e Professores";
  return topic ? `Olá! Preciso de ajuda para ${topic} (${festa}).` : `Olá! Tenho uma dúvida sobre a ${festa}.`;
}

/** Link pronto para o WhatsApp da organização (null se não houver número). */
export function useHelpLink(topic?: string) {
  const { phone, eventName } = useContext(HelpContext);
  if (!phone) return null;
  return { href: whatsappLink(phone, helpMessage(eventName, topic)), phoneLabel: formatPhone(phone) };
}

/** Linha discreta de ajuda dentro de formulários e avisos. */
export function HelpLine({ topic, className, lead = "Dificuldade?" }: { topic?: string; className?: string; lead?: string }) {
  const link = useHelpLink(topic);
  if (!link) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 text-sm text-fg-muted", className)}>
      <Whatsapp className="size-4 text-success" />
      {lead}{" "}
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => playSound("blip")}
        className="font-semibold text-fg underline decoration-success/60 underline-offset-4 hover:text-success"
        data-testid="help-line"
      >
        Fale com a gente no WhatsApp {link.phoneLabel}
      </a>
    </p>
  );
}

/**
 * Botão flutuante de dúvidas (WhatsApp da organização). No celular, o balão
 * "Dúvidas?" aparece por alguns segundos e depois fica só o ícone.
 */
export function HelpButton({ topic, className }: { topic?: string; className?: string }) {
  const link = useHelpLink(topic);
  const [bubble, setBubble] = useState(false);

  useEffect(() => {
    const show = window.setTimeout(() => setBubble(true), 1800);
    const hide = window.setTimeout(() => setBubble(false), 8000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, []);

  if (!link) return null;
  return (
    <div className={cn("no-print fixed right-4 bottom-6 z-30 flex items-center gap-2", className)}>
      <AnimatePresence>
        {bubble ? (
          <motion.span
            initial={{ opacity: 0, x: 12, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="pointer-events-none relative rounded-lg border-2 border-success/60 bg-ink/95 px-3 py-2 text-xs font-bold text-fg shadow-[0_0_24px_-8px_var(--success)]"
          >
            Dúvidas? Chama no Zap
            <span className="absolute top-1/2 -right-[7px] size-3 -translate-y-1/2 rotate-45 border-t-2 border-r-2 border-success/60 bg-ink" aria-hidden />
          </motion.span>
        ) : null}
      </AnimatePresence>
      <motion.a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => playSound("blip")}
        onMouseEnter={() => setBubble(true)}
        onMouseLeave={() => setBubble(false)}
        onFocus={() => setBubble(true)}
        onBlur={() => setBubble(false)}
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.6 }}
        whileTap={{ scale: 0.9 }}
        className="relative inline-flex size-14 items-center justify-center rounded-full border-2 border-ink bg-success text-success-foreground shadow-[0_4px_0_0_rgb(0_0_0/0.45),0_0_30px_-6px_var(--success)] outline-none focus-visible:ring-[3px] focus-visible:ring-success/60"
        aria-label={`Dúvidas? Fale com a organização no WhatsApp ${link.phoneLabel}`}
        data-testid="help-button"
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-success/30 motion-reduce:hidden [animation-duration:2.4s]" aria-hidden />
        <Whatsapp className="relative size-7" />
      </motion.a>
    </div>
  );
}
