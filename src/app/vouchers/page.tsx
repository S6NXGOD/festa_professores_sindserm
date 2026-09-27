import type { Metadata } from "next";
import { HelpLine } from "@/components/help/help";
import { Building, Login, QrCode, Users } from "@/components/icons/pixel";
import { Reveal } from "@/components/motion/reveal";
import { PublicShell } from "@/components/public/public-shell";
import { RecoverVouchersForm } from "@/components/voucher/recover-vouchers-form";
import { APP_NAME, getEventInfo } from "@/server/queries/config";

export const metadata: Metadata = {
  title: "Recuperar meus vouchers",
  description: "Perdeu o link dos vouchers? Recupere com o CPF e o WhatsApp da inscrição.",
  referrer: "no-referrer",
};

const TIPS = [
  { icon: Users, text: "Convidado(a)? Os dois vouchers ficam com quem te convidou: peça para essa pessoa recuperar." },
  { icon: Building, text: "Colaborador(a) do SINDSERM? O seu voucher é enviado pela organização." },
  {
    icon: Login,
    text: "Sem o voucher no dia? Na portaria a equipe encontra você pelo nome ou pelo CPF. Com o QR Code, a fila só anda mais rápido.",
  },
] as const;

/** Perdeu o link dos vouchers: recupera com o CPF e o WhatsApp usados na inscrição. */
export default async function RecoverVouchersPage() {
  const event = await getEventInfo();
  const eventName = event?.name ?? APP_NAME;
  return (
    <PublicShell eventName={eventName} backdrop="calm" help={{ topic: "recuperar os meus vouchers" }}>
      <section className="mx-auto max-w-md">
        <Reveal className="text-center">
          <div className="relative mx-auto flex size-20 items-center justify-center rounded-2xl border-2 border-red/60 bg-red/10 shadow-[0_0_40px_-10px_var(--glow)]">
            <QrCode className="size-11 text-red" />
            <span className="pixel absolute -top-3 -right-4 rotate-6 rounded-[3px] bg-warning px-1.5 py-1 text-[0.5rem] text-warning-foreground">
              ?
            </span>
          </div>
          <p className="pixel mt-6 text-[0.62rem] text-red neon-red" aria-hidden>
            Continue? <span className="ml-0.5 inline-block h-[0.9em] w-[0.55em] animate-blink bg-current align-[-0.1em]" />
          </p>
          <h1 className="display mt-3 text-5xl text-fg sm:text-6xl">Perdeu o voucher?</h1>
          <p className="mx-auto mt-3 max-w-sm text-fg-muted">
            Digite o CPF e o WhatsApp que você usou na inscrição. Os seus vouchers (e o do seu convidado) abrem na hora.
          </p>
        </Reveal>

        <Reveal delay={0.06} className="mt-7 rounded-2xl border border-line bg-surface/95 p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] backdrop-blur sm:p-6">
          <RecoverVouchersForm />
        </Reveal>

        <Reveal delay={0.12} className="mt-6">
          <ul className="grid gap-2.5">
            {TIPS.map((tip) => (
              <li key={tip.text} className="flex items-start gap-3 rounded-xl border border-line/70 bg-ink-2/70 px-3.5 py-3 text-sm text-fg-muted">
                <tip.icon className="mt-0.5 size-5 shrink-0 text-red" />
                <span>{tip.text}</span>
              </li>
            ))}
          </ul>
          <HelpLine lead="Não deu certo?" topic="recuperar os meus vouchers" className="mt-5 justify-center" />
        </Reveal>
      </section>
    </PublicShell>
  );
}
