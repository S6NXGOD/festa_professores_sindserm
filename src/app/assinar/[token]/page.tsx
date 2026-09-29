import type { Metadata } from "next";
import { Check, ClipboardNote, Clock, Download, ExternalLink, Lock, PartyPopper, Pencil, Search, Smartphone, Whatsapp } from "@/components/icons/pixel";
import { Reveal } from "@/components/motion/reveal";
import { MessageCard } from "@/components/public/message-card";
import { PublicShell } from "@/components/public/public-shell";
import { PixelTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { signedFormReturnMessage } from "@/domain/whatsapp-messages";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { firstName } from "@/lib/text";
import { cn } from "@/lib/utils";
import { APP_NAME, getEventInfo } from "@/server/queries/config";
import { getAffiliationForm } from "@/server/queries/panel";
import { consumeRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { clientIp } from "@/server/session";
import { readSigningToken } from "@/server/signing-link";

export const metadata: Metadata = { title: "Assinar a ficha pelo gov.br", referrer: "no-referrer", robots: { index: false, follow: false } };

/** Dias até a festa (contagem da página). */
function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

/** Assinador oficial do governo (ITI). */
const GOVBR_SIGNER = "https://assinador.iti.br";

/**
 * Passo a passo para assinar a ficha de filiação pelo gov.br, sem esperar a
 * festa: baixar a ficha, assinar no assinador do gov.br e mandar o PDF assinado
 * para o WhatsApp da secretaria. Abre pelo link que a equipe manda (ou pelos vouchers).
 */
export default async function SignFormPage({ params }: PageProps<"/assinar/[token]">) {
  const [{ token }, event] = await Promise.all([params, getEventInfo()]);
  const eventName = event?.name ?? APP_NAME;

  const limit = await consumeRateLimit(RATE_LIMITS.voucherView, await clientIp());
  if (!limit.allowed) {
    return (
      <PublicShell eventName={eventName} backdrop="calm">
        <MessageCard icon={Clock} title="Muitas tentativas" kicker="Pause" tone="warning">
          Aguarde alguns minutos e tente novamente.
        </MessageCard>
      </PublicShell>
    );
  }

  const formId = readSigningToken(token);
  const data = formId ? await getAffiliationForm(formId) : null;
  if (!data || data.form.status === "CANCELLED") {
    return (
      <PublicShell eventName={eventName} backdrop="calm" help={{ topic: "assinar a minha ficha de filiação (o link não funcionou)" }}>
        <MessageCard icon={Search} title="Link inválido ou vencido" kicker="Fita não encontrada" tone="danger">
          Peça um link novo para a organização do SINDSERM. Se preferir, a ficha também pode ser assinada no papel, na recepção da festa.
        </MessageCard>
      </PublicShell>
    );
  }

  const form = data.form;
  const first = firstName(form.fullName);
  if (form.status === "FORMALIZED") {
    return (
      <PublicShell eventName={eventName} backdrop="calm">
        <MessageCard icon={PartyPopper} title={`Tudo certo, ${first}!`} kicker="Ficha assinada">
          A sua ficha já foi assinada e a filiação está efetivada. O seu voucher vale na entrada da festa.
        </MessageCard>
      </PublicShell>
    );
  }

  const phone = event?.formsWhatsapp ?? null;
  const reference = form.id.slice(0, 8).toUpperCase();
  const returnLink = phone ? whatsappLink(phone, signedFormReturnMessage({ fullName: form.fullName, reference })) : null;
  const daysLeft = event?.startsAt ? daysUntil(event.startsAt) : null;

  return (
    <PublicShell eventName={eventName} backdrop="calm" help={{ topic: "assinar a minha ficha de filiação pelo gov.br" }}>
      <section className="mx-auto max-w-xl">
        <Reveal className="text-center">
          <span className="relative mx-auto inline-flex size-16 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_4px_0_0_var(--brand-strong),0_0_40px_-10px_var(--glow)]">
            <Pencil className="size-9" />
          </span>
          <p className="pixel mt-5 text-[0.6rem] text-red neon-red">Sem esperar a festa</p>
          <h1 className="display mt-3 text-5xl text-fg sm:text-6xl">Assine pelo gov.br</h1>
          <p className="mx-auto mt-3 max-w-md text-fg-muted">
            Olá, {first}! A sua ficha de filiação ao SINDSERM está pronta. São 4 passos, tudo pelo celular — e a sua entrada fica
            liberada antes da festa.
          </p>
          {daysLeft && daysLeft > 0 ? (
            <div className="mt-4 flex justify-center">
              <PixelTag tone="neutral">{daysLeft === 1 ? "Falta 1 dia para a festa" : `Faltam ${daysLeft} dias para a festa`}</PixelTag>
            </div>
          ) : null}
        </Reveal>

        <ol className="mt-8 space-y-3" data-testid="signing-steps">
          <Step index={1} delay={0.05} title="Baixe a sua ficha" icon={Download}>
            <p>Já vem preenchida com os seus dados, igual à ficha impressa.</p>
            <Button asChild size="lg" className="mt-3 w-full sm:w-auto">
              <a href={`/assinar/${token}/ficha`} download data-testid="download-ficha">
                <Download /> Baixar a ficha (PDF)
              </a>
            </Button>
          </Step>
          <Step index={2} delay={0.1} title="Abra o assinador do gov.br" icon={Smartphone}>
            <p>
              Entre com a sua conta gov.br (nível <strong className="text-fg">prata</strong> ou <strong className="text-fg">ouro</strong>). Ainda
              não tem esse nível? O app gov.br mostra como aumentar, em poucos minutos.
            </p>
            <Button asChild variant="outline" size="lg" className="mt-3 w-full sm:w-auto">
              <a href={GOVBR_SIGNER} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Abrir o assinador gov.br
              </a>
            </Button>
          </Step>
          <Step index={3} delay={0.15} title="Assine no quadro destacado" icon={Pencil}>
            <p>
              Envie o PDF da ficha, coloque a assinatura no quadro vermelho <strong className="text-fg">“Assinatura do(a) Servidor(a)”</strong> e
              confirme com o código que chega no celular. Depois, <strong className="text-fg">baixe o PDF assinado</strong>.
            </p>
          </Step>
          <Step index={4} delay={0.2} title="Mande para a secretaria" icon={Whatsapp}>
            {returnLink ? (
              <>
                <p>
                  Mande o PDF assinado para o WhatsApp da secretaria do SINDSERM: <strong className="text-fg">{formatPhone(phone)}</strong>. A
                  mensagem já vai escrita; é só anexar o arquivo.
                </p>
                <Button asChild variant="success" size="lg" className="mt-3 w-full sm:w-auto">
                  <a href={returnLink} target="_blank" rel="noopener noreferrer" data-testid="send-signed-form">
                    <Whatsapp /> Mandar para a secretaria
                  </a>
                </Button>
              </>
            ) : (
              <p>Responda a mensagem da organização (a que trouxe este link) com o PDF assinado.</p>
            )}
          </Step>
        </ol>

        <Reveal delay={0.25} className="mt-5 flex items-start gap-3 rounded-xl border border-success/40 bg-success-soft p-4 text-sm text-fg">
          <Check className="mt-0.5 size-5 shrink-0 text-success-text" />
          <p>
            <strong>Pronto!</strong> Quando a secretaria conferir a assinatura, a sua filiação fica efetivada e o seu voucher já vale na
            entrada da festa.
          </p>
        </Reveal>
        <Reveal delay={0.3} className="mt-3 flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-fg-muted">
          <ClipboardNote className="mt-0.5 size-5 shrink-0 text-fg" />
          <p>
            Prefere assinar no papel? Sem problema: a sua ficha vai estar na recepção no dia da festa{event ? ` (${event.dateLabel})` : ""}.
          </p>
        </Reveal>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-fg-dim">
          <Lock className="size-3.5" /> Este link é só seu: ele abre a ficha com os seus dados. Não compartilhe.
        </p>
      </section>
    </PublicShell>
  );
}

function Step({
  index,
  title,
  icon: Icon,
  delay,
  children,
}: {
  index: number;
  title: string;
  icon: typeof Pencil;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={delay} className="relative flex gap-3.5 rounded-2xl border border-line bg-surface p-4 sm:p-5" data-testid={`signing-step-${index}`}>
      <span
        className={cn(
          "pixel inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-[0.7rem] text-white",
          index === 4 ? "bg-success text-success-foreground" : "bg-brand shadow-[0_3px_0_0_var(--brand-strong)]",
        )}
        aria-hidden
      >
        {index}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-fg-muted">
        <h2 className="display flex items-center gap-2 text-2xl leading-none text-fg">
          <Icon className="size-5 shrink-0 text-red" /> {title}
        </h2>
        <div className="mt-2">{children}</div>
      </div>
    </Reveal>
  );
}
