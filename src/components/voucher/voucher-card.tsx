import { FestaEmblem, UnionLogo } from "@/components/brand/brand";
import { Calendar, ClipboardNote, Gift, Info, Login, MapPin, Star, Warning, Whatsapp } from "@/components/icons/pixel";
import { PixelTag, PlayerTag } from "@/components/retro/bits";
import { formatShortDateTime } from "@/lib/datetime";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { EventInfo } from "@/server/queries/config";
import type { VoucherCardData } from "@/server/queries/vouchers";

export interface VoucherEventInfo {
  name: string;
  dateLabel: string;
  timeLabel: string;
  kitDeadlineLabel?: string | null;
  venueName?: string | null;
  /** WhatsApp da organização para dúvidas (aparece no rodapé do voucher). */
  helpWhatsapp?: string | null;
}

/** Dados do evento que aparecem no voucher. */
export function voucherEventFrom(event: EventInfo): VoucherEventInfo {
  return {
    name: event.name,
    dateLabel: event.dateLabel,
    timeLabel: event.timeLabel,
    kitDeadlineLabel: event.kitDeadline?.label ?? null,
    venueName: event.venue?.name ?? null,
    helpWhatsapp: event.helpWhatsapp,
  };
}

/**
 * Voucher com visual de ingresso de show dos anos 80. Funcionários do SINDSERM
 * ganham o "passe da casa" (dourado), para não confundir com o voucher dos
 * filiados. Componente puro (servidor ou cliente).
 */
export function VoucherCard({
  card,
  event,
  className,
  eager = false,
}: {
  card: VoucherCardData;
  event: VoucherEventInfo;
  className?: string;
  /** Primeiro voucher da página: o cartaz carrega junto com a página. */
  eager?: boolean;
}) {
  if (card.kind === "EMPLOYEE") return <EmployeePass card={card} event={event} className={className} eager={eager} />;
  const isMember = card.kind === "MEMBER";
  const status = card.affiliationStatus;
  const active = status === "CONFIRMED" || status === "JOINED_AT_EVENT";

  return (
    <article
      className={cn(
        "relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border-2 border-red/60 bg-[#0e0e0f] text-fg shadow-[0_0_46px_-18px_var(--glow),0_30px_60px_-30px_rgb(0_0_0/0.9)] print:border-black print:bg-white print:text-black print:shadow-none",
        className,
      )}
      aria-label={`Voucher de ${card.fullName}`}
      data-testid="voucher-card"
    >
      <div className="relative bg-ink print:bg-white">
        <FestaEmblem className="mx-auto w-[82%] pt-2" sizes="320px" eager={eager} />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0e0e0f] to-transparent print:hidden" />
      </div>

      <div className="relative px-5 pt-1 pb-4">
        <div className="flex items-center justify-between gap-2">
          <PlayerTag player={isMember ? 1 : 2} />
          <span className="pixel text-[0.5rem] text-fg-muted print:text-black">Admit one</span>
        </div>
        <h3 className="display mt-3 text-[1.9rem] break-words text-fg print:text-black" data-testid="voucher-name">
          {card.fullName}
        </h3>
        <p className="mt-1 text-sm font-semibold text-fg-muted print:text-black">
          {isMember ? (
            card.isTeacher ? (
              "Professor(a) filiado(a)"
            ) : (
              "Filiado(a) ao SINDSERM"
            )
          ) : (
            <>
              Convidado(a) de <span className="text-fg print:text-black">{card.hostName}</span>
            </>
          )}
          {card.isMinor ? " · menor de 18 anos" : ""}
        </p>
      </div>

      <Perforation tone="red" />

      <div className="flex flex-col items-center px-5 pt-3 pb-5">
        <QrBlock card={card} event={event} />
        <div className="mt-4 w-full space-y-2 text-sm">
          {card.checkedInAt ? (
            <Note tone="success" icon={Login}>
              Entrada registrada {formatShortDateTime(card.checkedInAt)}
            </Note>
          ) : null}
          {isMember ? <MemberNotes card={card} active={active} kitDeadline={event.kitDeadlineLabel} /> : null}
          {!isMember ? (
            <Note tone="red" icon={Gift} testId="voucher-guest-kit">
              <strong className="font-bold">Você tem direito a um kit de consumação.</strong> Ele é entregue na recepção depois que{" "}
              {card.hostName ?? "quem te convidou"} chegar.
              {event.kitDeadlineLabel ? ` Kits até ${event.kitDeadlineLabel}.` : ""}
            </Note>
          ) : null}
        </div>
      </div>

      <VoucherFooter helpWhatsapp={event.helpWhatsapp} />
    </article>
  );
}

/** Voucher de funcionário(a) do SINDSERM: o "passe da casa", dourado, diferente do voucher dos filiados. */
function EmployeePass({
  card,
  event,
  className,
  eager,
}: {
  card: VoucherCardData;
  event: VoucherEventInfo;
  className?: string;
  eager: boolean;
}) {
  return (
    <article
      className={cn(
        "relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border-2 border-warning/80 bg-[#0e0e0f] text-fg shadow-[0_0_46px_-16px_rgb(248_192_0/0.6),0_30px_60px_-30px_rgb(0_0_0/0.9)] print:border-black print:bg-white print:text-black print:shadow-none",
        className,
      )}
      aria-label={`Voucher de funcionário(a) do SINDSERM: ${card.fullName}`}
      data-testid="voucher-card"
      data-kind="employee"
    >
      <div className="relative bg-ink print:bg-white">
        <FestaEmblem className="mx-auto w-[82%] pt-2" sizes="320px" eager={eager} />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0e0e0f] to-transparent print:hidden" />
      </div>
      {/* Faixa dourada: é assim que a portaria reconhece de longe o voucher de funcionário. */}
      <div className="flex items-center justify-between bg-[linear-gradient(90deg,#c99400,#ffd84a_45%,#f8c000)] px-5 py-2 text-warning-foreground print:border-y print:border-black print:bg-none">
        <span className="pixel flex items-center gap-1.5 text-[0.7rem]">
          <Star className="size-3.5" /> Passe da casa
        </span>
        <span className="pixel text-[0.55rem]">SINDSERM</span>
      </div>

      <div className="relative px-5 pt-3 pb-4">
        <div className="flex items-center justify-between gap-2">
          <PixelTag tone="warning">Funcionário(a)</PixelTag>
          <span className="pixel text-[0.5rem] text-fg-muted print:text-black">Admit one</span>
        </div>
        <h3 className="display mt-3 text-[1.9rem] break-words text-fg print:text-black" data-testid="voucher-name">
          {card.fullName}
        </h3>
        <p className="mt-1 text-sm font-semibold text-warning print:text-black" data-testid="voucher-job">
          Funcionário(a) do SINDSERM{card.jobTitle ? ` · ${card.jobTitle}` : ""}
        </p>
      </div>

      <Perforation tone="warning" />

      <div className="flex flex-col items-center px-5 pt-3 pb-5">
        <QrBlock card={card} event={event} />
        <div className="mt-4 w-full space-y-2 text-sm">
          {card.checkedInAt ? (
            <Note tone="success" icon={Login}>
              Entrada registrada {formatShortDateTime(card.checkedInAt)}
            </Note>
          ) : null}
          <Note tone="warning" icon={Gift} testId="voucher-employee-kit">
            <strong className="font-bold">{card.guestName ? "2 kits de consumação" : "1 kit de consumação"}</strong>
            {card.guestName ? (
              <>
                {" "}
                — o seu e o de <span data-testid="voucher-guest-name">{card.guestName}</span>
              </>
            ) : null}
            .{" "}
            {card.guestName
              ? "O seu sai na recepção, junto com a sua entrada; o do convidado, depois que você chegar."
              : "Entregue na recepção, junto com a sua entrada."}
            {event.kitDeadlineLabel ? ` Kits até ${event.kitDeadlineLabel}.` : ""}
          </Note>
        </div>
      </div>

      <VoucherFooter helpWhatsapp={event.helpWhatsapp} />
    </article>
  );
}

/** Picote do ingresso. */
function Perforation({ tone }: { tone: "red" | "warning" }) {
  const edge = tone === "red" ? "border-red/60" : "border-warning/70";
  return (
    <div className="relative h-5" aria-hidden>
      <span className={cn("absolute top-0 -left-3 size-5 rounded-full border-2 bg-ink print:border-black print:bg-white", edge)} />
      <span className={cn("absolute top-0 -right-3 size-5 rounded-full border-2 bg-ink print:border-black print:bg-white", edge)} />
      <span className="absolute top-1/2 right-4 left-4 border-t-2 border-dashed border-line-strong print:border-black/40" />
    </div>
  );
}

function QrBlock({ card, event }: { card: VoucherCardData; event: VoucherEventInfo }) {
  return (
    <>
      <div
        className="w-full max-w-[14.5rem] rounded-xl bg-white p-2.5 shadow-[0_0_0_4px_rgb(255_38_38/0.25)] [&_svg]:h-auto [&_svg]:w-full print:shadow-none"
        role="img"
        aria-label="QR Code do voucher"
        dangerouslySetInnerHTML={{ __html: card.qrSvg }}
      />
      {/* Código em fonte comum: na fonte pixel, "2" e "Z" se confundem na digitação da portaria. */}
      <p className="mt-4 text-xl font-bold tracking-[0.22em] text-fg tabular print:text-black" data-testid="voucher-code">
        {card.code}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-fg-muted print:text-black">
        <Calendar className="size-3.5 text-red" />
        {event.dateLabel} · {event.timeLabel}
      </p>
      {event.venueName ? (
        <p className="mt-1 flex items-center gap-1.5 text-center text-xs font-semibold text-fg-muted print:text-black">
          <MapPin className="size-3.5 text-red" />
          {event.venueName}
        </p>
      ) : null}
    </>
  );
}

/** Rodapé do ingresso: a assinatura do organizador e o WhatsApp para dúvidas. */
function VoucherFooter({ helpWhatsapp }: { helpWhatsapp?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2 border-t border-line px-5 py-3 print:border-black/20">
      <UnionLogo variant="white" className="w-36 print:hidden" sizes="144px" />
      <UnionLogo variant="color" className="hidden w-36 print:block" sizes="144px" />
      {helpWhatsapp ? (
        <a
          href={whatsappLink(helpWhatsapp, "Olá! Tenho uma dúvida sobre o meu voucher da festa.")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-fg-muted hover:text-success print:text-black"
          data-testid="voucher-help"
        >
          <Whatsapp className="size-3.5 text-success print:text-black" /> Dúvidas? WhatsApp {formatPhone(helpWhatsapp)}
        </a>
      ) : null}
    </div>
  );
}

function MemberNotes({ card, active, kitDeadline }: { card: VoucherCardData; active: boolean; kitDeadline?: string | null }) {
  const status = card.affiliationStatus;
  return (
    <>
      {status === "PENDING" ? (
        <Note tone="warning" icon={Warning}>
          O SINDSERM ainda vai confirmar a sua filiação. A entrada é liberada depois disso.
        </Note>
      ) : null}
      {status === "AWAITING_SIGNATURE" ? (
        <Note tone="warning" icon={ClipboardNote} testId="voucher-signature">
          Sua ficha de filiação vai estar na recepção: é só assinar e entrar.
        </Note>
      ) : null}
      {status === "REJECTED" ? (
        <Note tone="danger" icon={Warning}>
          O SINDSERM não confirmou a sua filiação. Procure o Atendimento na entrada: se você comprovar que é filiado(a), resolve na hora.
        </Note>
      ) : null}
      {card.isTeacher ? (
        <Note tone="red" icon={Gift} testId="voucher-kits">
          <strong className="font-bold">{card.guestName ? "2 kits de consumação" : "1 kit de consumação"}</strong>
          {card.guestName ? (
            <>
              {" "}
              — o seu e o de <span data-testid="voucher-guest-name">{card.guestName}</span>
            </>
          ) : null}
          .{" "}
          {status === "AWAITING_SIGNATURE"
            ? `${card.guestName ? "Liberados" : "Liberado"} depois que você assinar a ficha. `
            : !active && status !== "REJECTED"
              ? `${card.guestName ? "Liberados" : "Liberado"} depois que o SINDSERM confirmar a sua filiação. `
              : ""}
          {card.guestName
            ? "O seu sai na recepção, junto com a sua entrada; o do convidado, depois que você chegar."
            : "Entregue na recepção, junto com a sua entrada."}
          {kitDeadline ? ` Kits até ${kitDeadline}.` : ""}
        </Note>
      ) : (
        <Note tone="neutral" icon={Info}>
          Você participa da festa sem kit de consumação (o kit é só para professoras e professores).
        </Note>
      )}
    </>
  );
}

function Note({
  tone,
  icon: Icon,
  children,
  testId,
}: {
  tone: "success" | "warning" | "danger" | "red" | "neutral";
  icon: typeof Gift;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 leading-snug print:border-black/30 print:bg-white print:text-black",
        tone === "success" && "border-success/40 bg-success-soft text-fg",
        tone === "warning" && "border-warning/40 bg-warning-soft text-fg",
        tone === "danger" && "border-danger/40 bg-danger-soft text-fg",
        tone === "red" && "border-red/40 bg-brand-soft text-fg",
        tone === "neutral" && "border-line bg-surface-2 text-fg-muted",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "success" ? "text-success-text" : tone === "warning" ? "text-warning" : tone === "neutral" ? "text-fg-muted" : "text-red",
        )}
      />
      <span>{children}</span>
    </p>
  );
}
