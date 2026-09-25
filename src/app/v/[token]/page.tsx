import type { Metadata } from "next";
import { HelpLine } from "@/components/help/help";
import { Cancel, Clock, Search } from "@/components/icons/pixel";
import { Reveal } from "@/components/motion/reveal";
import { MessageCard } from "@/components/public/message-card";
import { PublicShell } from "@/components/public/public-shell";
import { AutoPrint } from "@/components/voucher/auto-print";
import { VoucherActions } from "@/components/voucher/voucher-actions";
import { VoucherCard, voucherEventFrom } from "@/components/voucher/voucher-card";
import { formatDateTime } from "@/lib/datetime";
import { APP_NAME, getEventInfo } from "@/server/queries/config";
import { loadVoucherByToken } from "@/server/queries/vouchers";
import { consumeRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { clientIp } from "@/server/session";

export const metadata: Metadata = { title: "Voucher", referrer: "no-referrer" };

const VOUCHER_HELP = "resolver um problema com o meu voucher";

export default async function SingleVoucherPage({ params, searchParams }: PageProps<"/v/[token]">) {
  const [{ token }, query, event] = await Promise.all([params, searchParams, getEventInfo()]);
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

  const result = event ? await loadVoucherByToken(token) : null;
  if (!event || !result || result.status === "NOT_FOUND") {
    return (
      <PublicShell eventName={eventName} backdrop="calm" help={{ topic: VOUCHER_HELP }}>
        <MessageCard icon={Search} title="Voucher não encontrado" kicker="Game over" tone="danger" action={{ href: "/", label: "Ir para o início" }}>
          Confira o link recebido.
          <HelpLine lead="Dúvidas?" topic={VOUCHER_HELP} className="mt-3 justify-center" />
        </MessageCard>
      </PublicShell>
    );
  }
  if (result.status === "REVOKED") {
    return (
      <PublicShell eventName={eventName} backdrop="calm" help={{ topic: `${VOUCHER_HELP} (cancelado)` }}>
        <MessageCard icon={Cancel} title="Voucher cancelado" tone="danger">
          Este QR Code foi cancelado em {formatDateTime(result.revokedAt)}. Procure o(a) professor(a) responsável ou a
          organização.
          <HelpLine lead="Precisa de ajuda?" topic={`${VOUCHER_HELP} (cancelado)`} className="mt-3 justify-center" />
        </MessageCard>
      </PublicShell>
    );
  }

  return (
    <PublicShell eventName={event.name} className="max-w-md" backdrop="calm" help={{ topic: `${VOUCHER_HELP} (código ${result.card.code})` }}>
      <AutoPrint enabled={query.imprimir === "1"} />
      <Reveal>
        <VoucherCard
          eager
          card={result.card}
          event={voucherEventFrom(event)}
        />
      </Reveal>
      <Reveal delay={0.1} className="mt-5">
        <VoucherActions token={token} fullName={result.card.fullName} eventName={event.name} printMode="self" />
      </Reveal>
    </PublicShell>
  );
}
