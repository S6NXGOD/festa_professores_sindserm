"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ClipboardNote, Gift, MemberCard, UserPlus, Users } from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { FichaWizard } from "./ficha-wizard";
import { MemberWizard } from "./member-wizard";

type Path = "choose" | "not-member" | "guest-info" | "member" | "ficha";

/** Porta de entrada da inscrição pública: filiado(a), ficha de filiação ou convidado. */
export function RegistrationFlow({
  initialPath = "choose",
  today,
  venue,
}: {
  initialPath?: "choose" | "ficha";
  today: string;
  /** Cartão do local da festa (vem pronto do servidor). */
  venue?: React.ReactNode;
}) {
  const [path, setPath] = useState<Path>(initialPath);

  if (path === "member") return <MemberWizard mode="public" onExit={() => setPath("choose")} />;
  if (path === "ficha") return <FichaWizard today={today} onExit={() => setPath("not-member")} />;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={path}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-xl"
      >
        {path === "choose" ? (
          <div className="text-center">
            <p className="pixel text-[0.62rem] text-red neon-red">
              Press start<span className="animate-blink">_</span>
            </p>
            <h1 className="display mt-4 text-[2.6rem] text-fg sm:text-5xl">Você é filiado(a) ao SINDSERM?</h1>
            <p className="mt-3 text-fg-muted">A inscrição é feita por quem é filiado(a), que também cadastra o seu convidado.</p>
            <div className="mt-8 grid gap-3 text-left">
              <BigChoice
                icon={MemberCard}
                title="Sim, sou filiado(a)"
                hint="Fazer minha inscrição"
                onClick={() => setPath("member")}
                primary
                testId="answer-member-yes"
              />
              <BigChoice
                icon={UserPlus}
                title="Ainda não sou"
                hint="Ver como participar"
                onClick={() => setPath("not-member")}
                testId="answer-member-no"
              />
            </div>
            {venue ? <div className="mt-8">{venue}</div> : null}
          </div>
        ) : null}

        {path === "not-member" ? (
          <div>
            <h1 className="display text-4xl text-fg sm:text-5xl">Bora entrar para o time?</h1>
            <p className="mt-3 text-fg-muted">Quem não é filiado(a) participa de um destes jeitos:</p>
            <div className="mt-6 grid gap-3">
              <BigChoice
                icon={ClipboardNote}
                title="Quero me filiar agora"
                hint="Preencho a ficha aqui e só assino na recepção da festa"
                onClick={() => setPath("ficha")}
                primary
                testId="choose-ficha"
                badge="Recomendado"
              />
              <BigChoice
                icon={Users}
                title="Vou como convidado(a)"
                hint="Um(a) professor(a) filiado(a) me cadastra como convidado"
                onClick={() => setPath("guest-info")}
                testId="choose-guest"
              />
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-red/40 bg-brand-soft p-4 text-sm leading-relaxed text-fg" data-testid="kit-teachers-only">
              <Gift className="mt-0.5 size-5 shrink-0 text-red" />
              <span>
                Qualquer servidor(a) municipal pode se filiar e vir à festa. <strong>O kit de consumação (e o convidado) é só
                para professoras e professores.</strong>
              </span>
            </p>
            <Button variant="ghost" className="mt-6" onClick={() => setPath("choose")}>
              <ArrowLeft /> Voltar
            </Button>
          </div>
        ) : null}

        {path === "guest-info" ? (
          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8" role="status">
            <PixelTag tone="neutral">Player 2</PixelTag>
            <h1 className="display mt-4 text-4xl text-fg">Entre como convidado(a)</h1>
            <p className="mt-3 leading-relaxed text-fg-muted">
              Cada professor(a) filiado(a) pode levar <strong className="text-fg">um convidado</strong>. Peça para ele(a)
              cadastrar você (nome completo e, se tiver, CPF) na inscrição dele(a) — você recebe o seu próprio QR Code.
            </p>
            <p className="mt-3 leading-relaxed text-fg-muted">
              Mudou de ideia? Você também pode <strong className="text-fg">se filiar</strong> preenchendo a ficha agora.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" onClick={() => setPath("not-member")}>
                <ArrowLeft /> Voltar
              </Button>
              <Button onClick={() => setPath("ficha")}>
                Quero me filiar <ArrowRight />
              </Button>
            </div>
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}

function BigChoice({
  icon: Icon,
  title,
  hint,
  onClick,
  primary = false,
  testId,
  badge,
}: {
  icon: typeof MemberCard;
  title: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
  testId: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        playSound("blip");
        onClick();
      }}
      data-testid={testId}
      className={cn(
        "group relative flex items-center gap-4 overflow-hidden rounded-2xl border-2 p-5 text-left transition-[border-color,box-shadow,transform] outline-none focus-visible:ring-[3px] focus-visible:ring-red/50 active:scale-[0.99]",
        primary
          ? "border-red/70 bg-[linear-gradient(135deg,rgb(227_0_15/0.28),rgb(227_0_15/0.06))] hover:border-red hover:shadow-[0_0_36px_-12px_var(--glow)]"
          : "border-line-strong bg-surface hover:border-[#5a5a61]",
      )}
    >
      <span
        className={cn(
          "inline-flex size-14 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:-rotate-3",
          primary ? "bg-brand text-white shadow-[0_4px_0_0_var(--brand-strong)]" : "bg-surface-3 text-fg",
        )}
      >
        <Icon className="size-7" />
      </span>
      <span className="min-w-0 flex-1">
        {badge ? <span className="pixel mb-1 block text-[0.5rem] text-red">{badge}</span> : null}
        <span className="display block text-2xl text-fg">{title}</span>
        <span className="mt-0.5 block text-sm text-fg-muted">{hint}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-fg-dim transition-transform group-hover:translate-x-1 group-hover:text-red" />
    </button>
  );
}
