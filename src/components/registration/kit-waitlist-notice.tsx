"use client";

import { motion } from "motion/react";
import { Gift, Hourglass } from "@/components/icons/pixel";
import type { KitOutlook } from "@/domain/kit-supply";
import { firstName } from "@/lib/text";
import { ConsentBox } from "./wizard-parts";

/** Faixa no começo da inscrição: os kits acabaram, mas a inscrição (e a festa) continuam. */
export function KitsSoldOutBanner({ staff = false }: { staff?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border-2 border-warning/60 bg-[linear-gradient(135deg,rgb(250_204_21/0.16),rgb(8_8_8/0.85)_70%)] p-4 text-left"
      data-testid="kits-sold-out"
    >
      <span className="scanlines pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      <p className="pixel relative text-[0.55rem] text-warning">
        Kits esgotados<span className="animate-blink">_</span>
      </p>
      <p className="relative mt-1.5 font-bold text-fg">Os kits acabaram, a festa não!</p>
      <p className="relative mt-1 text-sm text-fg-muted">
        {staff
          ? "Os kits de consumação já estão todos com quem se inscreveu antes. A inscrição continua: o kit de quem entrar agora vai para a fila do kit (sai se vagar, por ordem)."
          : "Os kits de consumação já estão todos com quem se inscreveu antes. Você ainda pode se inscrever e vir à festa: o seu kit entra na fila e, se vagar, é seu (por ordem de inscrição)."}
      </p>
    </motion.div>
  );
}

/**
 * Resumo da inscrição com kit na fila: o que acontece, o lugar provável na fila
 * e (no site) a confirmação de quem leu o aviso.
 */
export function KitWaitlistNotice({
  outlook,
  staff,
  guestName,
  lateMessage,
  consent,
}: {
  outlook: KitOutlook;
  staff: boolean;
  guestName?: string | null;
  /** Os kits acabaram enquanto a pessoa preenchia (resposta do servidor). */
  lateMessage?: string | null;
  consent?: { checked: boolean; onChange: (value: boolean) => void; error?: string };
}) {
  const guestFirst = guestName ? firstName(guestName) : "o convidado";
  const memberWaits = outlook.member === "WAITLIST";
  const guestWaits = outlook.guest === "WAITLIST";
  const you = staff ? "o(a) professor(a)" : "você";
  const ownKit = staff ? "o kit do(a) professor(a)" : "o seu kit";
  const { member: memberPosition, guest: guestPosition } = outlook.position;
  const places =
    memberPosition && guestPosition ? ` (lugares nº ${memberPosition} e ${guestPosition})` : memberPosition ? ` (nº ${memberPosition})` : "";

  return (
    <div className="space-y-3" data-testid="kit-waitlist-notice">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
        className="relative overflow-hidden rounded-xl border-2 border-warning/60 bg-warning-soft p-4 text-sm leading-relaxed text-fg"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning text-ink shadow-[0_3px_0_0_#a16207]">
            <Hourglass className="size-6 animate-wiggle" />
          </span>
          <div className="min-w-0">
            <p className="pixel text-[0.5rem] text-warning">Fila do kit</p>
            {lateMessage ? <p className="mt-1 font-bold">{lateMessage}</p> : null}
            {memberWaits ? (
              <p className="mt-1">
                <strong>Os kits de consumação acabaram.</strong> {staff ? "A pessoa entra" : "Você entra"} na festa normalmente, e{" "}
                {guestWaits ? `${ownKit} e o de ${guestFirst} entram` : `${ownKit} entra`} na fila do kit{places}. Se vagar kit (alguém
                desistir ou o SINDSERM comprar mais), ele sai na recepção, por ordem de inscrição.
              </p>
            ) : guestWaits ? (
              <p className="mt-1">
                <strong>O último kit ficou com {you}!</strong> O de {guestFirst} entra na fila do kit
                {guestPosition ? ` (nº ${guestPosition})` : ""}: se vagar, sai na recepção, por ordem de inscrição.
              </p>
            ) : (
              <p className="mt-1">Confirme para continuar: o kit entra na fila e só sai se vagar.</p>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
              <Gift className="size-3.5 shrink-0" /> O voucher mostra a sua posição na fila e muda sozinho se o kit vagar.
            </p>
          </div>
        </div>
      </motion.div>
      {consent ? (
        <ConsentBox id="kit-waitlist-consent" checked={consent.checked} onChange={consent.onChange} error={consent.error} testId="kit-waitlist-consent" icon={Gift}>
          {memberWaits && guestWaits
            ? "Entendi: os nossos kits entram na fila do kit e só saem se vagar."
            : guestWaits && !memberWaits
              ? `Entendi: o kit de ${guestFirst} entra na fila do kit e só sai se vagar.`
              : "Entendi: o meu kit entra na fila do kit e só sai se vagar."}
        </ConsentBox>
      ) : null}
    </div>
  );
}
