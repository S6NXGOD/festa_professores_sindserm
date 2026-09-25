import type { Metadata } from "next";
import { HelpLine } from "@/components/help/help";
import { ClipboardNote, Clock, PartyPopper, QrCode, Search, Warning } from "@/components/icons/pixel";
import { Reveal } from "@/components/motion/reveal";
import { MessageCard } from "@/components/public/message-card";
import { PublicShell } from "@/components/public/public-shell";
import { VenueCompact } from "@/components/public/venue";
import { PixelTag } from "@/components/retro/bits";
import { ScrollHint } from "@/components/retro/scroll-hint";
import { AffiliationBadge } from "@/components/status/status-badge";
import { Celebration } from "@/components/voucher/celebration";
import { CopyLinkBox } from "@/components/voucher/copy-link-box";
import { SaveVouchersMission } from "@/components/voucher/save-mission";
import { VoucherActions } from "@/components/voucher/voucher-actions";
import { VoucherCard, voucherEventFrom } from "@/components/voucher/voucher-card";
import { APP_NAME, getEventInfo } from "@/server/queries/config";
import { loadGroupByAccessToken } from "@/server/queries/vouchers";
import { consumeRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { clientIp } from "@/server/session";

export const metadata: Metadata = { title: "Meus vouchers", referrer: "no-referrer" };

export default async function GroupVouchersPage({ params, searchParams }: PageProps<"/vouchers/[token]">) {
  const [{ token }, query, event] = await Promise.all([params, searchParams, getEventInfo()]);
  const isNew = query.nova === "1";
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

  const group = event ? await loadGroupByAccessToken(token) : null;
  if (!group || !event || !group.member) {
    return (
      <PublicShell eventName={eventName} backdrop="calm" help={{ topic: "abrir os meus vouchers (o link não funcionou)" }}>
        <MessageCard icon={Search} title="Link inválido" kicker="Fita não encontrada" tone="danger" action={{ href: "/", label: "Voltar ao início" }}>
          Confira o link recebido ao concluir a inscrição.
          <HelpLine lead="Não achou?" topic="abrir os meus vouchers (o link não funcionou)" className="mt-3 justify-center" />
        </MessageCard>
      </PublicShell>
    );
  }

  const cards = [group.member, ...group.guests];
  const awaitingSignature = group.status === "AWAITING_SIGNATURE";
  const voucherEvent = voucherEventFrom(event);

  return (
    <PublicShell eventName={event.name} wide backdrop="calm" help={{ topic: `resolver uma dúvida sobre o meu voucher (código ${group.member.code})` }}>
      <Celebration enabled={isNew} />
      <section className="mx-auto max-w-3xl">
        <Reveal className="text-center">
          {isNew ? (
            <PartyPopper className="mx-auto size-14 text-red drop-shadow-[0_0_18px_var(--glow)]" />
          ) : (
            <QrCode className="mx-auto size-12 text-red" />
          )}
          <p className="pixel mt-5 text-[0.62rem] text-red neon-red">
            {isNew ? (cards.length > 1 ? "Player 1 + Player 2 prontos" : "Player 1 pronto") : "Seus vouchers"}
          </p>
          <h1 className="display mt-3 text-5xl text-fg sm:text-6xl">
            {isNew ? (awaitingSignature ? "Ficha gravada!" : "Você está na pista!") : "Vouchers da inscrição"}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-fg-muted">
            {cards.length === 1 ? "Seu voucher está pronto. " : "Um voucher para você e outro para o seu convidado. "}
            Cada pessoa apresenta o próprio QR Code na entrada.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <AffiliationBadge status={group.status} size="lg" />
            {group.isTeacher ? <PixelTag tone="red">Professor(a)</PixelTag> : <PixelTag tone="neutral">Sem kit</PixelTag>}
          </div>
        </Reveal>

        {awaitingSignature ? (
          <Reveal delay={0.05} className="mt-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-fg">
            <ClipboardNote className="mt-0.5 size-5 shrink-0 text-warning" />
            <p data-testid="awaiting-signature-note">
              <strong>Te esperamos na festa!</strong> A sua ficha de filiação vai estar na recepção, pronta para você assinar. Assinou,
              entrou!
            </p>
          </Reveal>
        ) : null}
        {group.status === "PENDING" ? (
          <Reveal delay={0.05} className="mt-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-fg">
            <Warning className="mt-0.5 size-5 shrink-0 text-warning" />
            <p>
              O SINDSERM vai confirmar a sua filiação. A entrada{group.isTeacher ? " e os kits são liberados" : " é liberada"} depois
              disso.
            </p>
          </Reveal>
        ) : null}

        <Reveal delay={0.06} className="mt-6">
          <SaveVouchersMission
            vouchers={cards.map((card) => ({
              personId: card.personId,
              token: card.token,
              fullName: card.fullName,
              kind: card.kind === "GUEST" ? "GUEST" : "MEMBER",
            }))}
            missionId={token.slice(0, 16)}
            eventName={event.name}
          />
        </Reveal>

        {event.venue ? (
          <Reveal delay={0.08} className="mt-6">
            <VenueCompact venue={event.venue} />
          </Reveal>
        ) : null}

        <Reveal delay={0.1} className="mt-6">
          <CopyLinkBox path={`/vouchers/${token}`} label="Guarde este link para abrir os vouchers depois" />
        </Reveal>


        <div id="seus-vouchers" className="mt-8 grid scroll-mt-6 gap-10 md:grid-cols-2">
          {cards.map((card, index) => (
            <Reveal key={card.personId} delay={0.14 + index * 0.06} className="space-y-4">
              <VoucherCard card={card} event={voucherEvent} eager={index === 0} />
              <VoucherActions token={card.token} fullName={card.fullName} eventName={event.name} printMode="open" className="mx-auto max-w-sm" />
            </Reveal>
          ))}
        </div>
      </section>
      <ScrollHint targetId="seus-vouchers" label={cards.length > 1 ? "Seus vouchers" : "Seu voucher"} />
    </PublicShell>
  );
}
