"use client";

import { motion } from "motion/react";
import { Clock, Gift, Hourglass } from "@/components/icons/pixel";
import type { KitOutlook } from "@/domain/kit-supply";
import { firstName } from "@/lib/text";
import { ConsentBox } from "./wizard-parts";
import { EDITION, T } from "@/domain/edition";

/** Um dos jeitos de o kit sair da fila (numerado, como as fases do jogo). */
function WayOut({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="pixel inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-warning text-[0.55rem] text-ink shadow-[0_2px_0_0_#a16207]">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** Faixa no começo da inscrição: os kits acabaram, mas a inscrição (e a festa) continuam. */
export function KitsSoldOutBanner({
  staff = false,
  deadlineLabel = null,
  testId = "kits-sold-out",
}: {
  staff?: boolean;
  /** Kits guardados até este horário: depois, as sobras saem por ordem de chegada. */
  deadlineLabel?: string | null;
  testId?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border-2 border-warning/60 bg-[linear-gradient(135deg,rgb(250_204_21/0.16),rgb(8_8_8/0.85)_70%)] p-4 text-left"
      data-testid={testId}
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
      {deadlineLabel ? (
        <p className="relative mt-2 flex items-start gap-1.5 text-xs text-fg-muted" data-testid="kits-sold-out-leftovers">
          <Clock className="mt-px size-3.5 shrink-0 text-warning" />
          <span>
            Depois das {deadlineLabel}, os kits de quem não veio saem para quem entrar, por ordem de chegada (enquanto houver).
          </span>
        </p>
      ) : null}
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
  reservedUntil = null,
}: {
  outlook: KitOutlook;
  staff: boolean;
  guestName?: string | null;
  /** Os kits acabaram enquanto a pessoa preenchia (resposta do servidor). */
  lateMessage?: string | null;
  consent?: { checked: boolean; onChange: (value: boolean) => void; error?: string };
  /** Kits guardados até este horário: depois, as sobras saem por ordem de chegada. */
  reservedUntil?: { label: string; passed: boolean } | null;
}) {
  const guestFirst = guestName ? firstName(guestName) : "o convidado";
  const memberWaits = outlook.member === "WAITLIST";
  const guestWaits = outlook.guest === "WAITLIST";
  const you = staff ? T.thePerson : "você";
  // Kit dividido: com convidado, o kit que entra na fila é o dos dois.
  const sharedWithGuest = EDITION.sharedKit && Boolean(guestName);
  const ownKit = sharedWithGuest ? (staff ? `o kit ${T.ofPerson} (para os dois)` : "o kit de vocês dois") : staff ? `o kit ${T.ofPerson}` : "o seu kit";
  const { member: memberPosition, guest: guestPosition } = outlook.position;
  const places =
    memberPosition && guestPosition ? ` (lugares nº ${memberPosition} e ${guestPosition})` : memberPosition ? ` (nº ${memberPosition})` : "";
  const after = reservedUntil && !reservedUntil.passed ? reservedUntil.label : null;
  // "…e só sai se vagar ou se sobrar depois das 22:00" (o fim da frase da confirmação).
  const unless = reservedUntil?.passed ? "só sai se sobrar kit na festa" : after ? `só sai se vagar ou se sobrar depois das ${after}` : "só sai se vagar ou se sobrar na festa";
  // Os dois jeitos de o kit sair da fila.
  const ways = (
    <ol className="mt-2.5 grid gap-2" data-testid="kit-waitlist-ways">
      {reservedUntil?.passed ? null : (
        <WayOut n={1}>
          <strong>Se vagar antes</strong> (alguém desistir ou o SINDSERM comprar mais): sai na recepção, por ordem de inscrição.{" "}
          {staff ? "O voucher avisa." : "O seu voucher avisa."}
        </WayOut>
      )}
      <WayOut n={reservedUntil?.passed ? 1 : 2}>
        {reservedUntil?.passed ? (
          <>
            <strong>Sobras da festa:</strong> já passou das {reservedUntil.label}, então os kits que sobraram saem na entrada, por ordem
            de chegada, enquanto houver.
          </>
        ) : after ? (
          <>
            <strong>Na festa, depois das {after}:</strong> os kits de quem não veio saem para quem entrar, por ordem de chegada, enquanto
            houver. {staff ? "Se a pessoa já tiver entrado, é só procurar a recepção depois desse horário." : "Se você já tiver entrado, procure a recepção depois desse horário."}
          </>
        ) : (
          <>
            <strong>Se sobrar na festa</strong> kit de quem não veio, a organização pode entregar na recepção.
          </>
        )}
      </WayOut>
    </ol>
  );

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
              <div className="mt-1">
                <p>
                  <strong>Os kits de consumação acabaram.</strong> {staff ? "A pessoa entra" : "Você entra"} na festa normalmente, e{" "}
                  {guestWaits ? `${ownKit} e o de ${guestFirst} entram` : `${ownKit} entra`} na fila do kit{places}. O kit sai da fila de
                  dois jeitos:
                </p>
                {ways}
              </div>
            ) : guestWaits ? (
              <div className="mt-1">
                <p>
                  <strong>O último kit ficou com {you}!</strong> O de {guestFirst} entra na fila do kit
                  {guestPosition ? ` (nº ${guestPosition})` : ""} e sai de dois jeitos:
                </p>
                {ways}
              </div>
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
            ? `Entendi: os nossos kits entram na fila do kit (cada um ${unless}).`
            : guestWaits && !memberWaits
              ? `Entendi: o kit de ${guestFirst} entra na fila do kit e ${unless}.`
              : `Entendi: ${sharedWithGuest ? "o nosso kit (para os dois)" : "o meu kit"} entra na fila do kit e ${unless}.`}
        </ConsentBox>
      ) : null}
    </div>
  );
}
