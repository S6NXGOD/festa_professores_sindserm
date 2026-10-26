import { FestaEmblem, UnionLogo } from "@/components/brand/brand";
import { Calendar, ClipboardNote, Gift, Heart, Hourglass, Info, Login, MapPin, Star, Warning, Whatsapp, Zap } from "@/components/icons/pixel";
import { PlayerTag } from "@/components/retro/bits";
import { EMPLOYEE_CATEGORY_LABEL, EMPLOYEE_CATEGORY_TITLE, employeeTitleLine } from "@/domain/labels";
import type { EmployeeCategory } from "@/domain/types";
import { formatShortDateTime } from "@/lib/datetime";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { properName } from "@/lib/text";
import { cn } from "@/lib/utils";
import type { EventInfo } from "@/server/queries/config";
import type { VoucherCardData } from "@/server/queries/vouchers";
import { EDITION, GAME, T } from "@/domain/edition";

export interface VoucherEventInfo {
  name: string;
  dateLabel: string;
  timeLabel: string;
  kitDeadlineLabel?: string | null;
  venueName?: string | null;
  /** WhatsApp da organização para dúvidas (aparece no rodapé do voucher). */
  helpWhatsapp?: string | null;
  /** O kit sai na mesa dos kits, depois da entrada (e não junto com ela). */
  kitsAtDesk?: boolean;
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
    kitsAtDesk: event.kitsAtDesk,
  };
}

/**
 * Voucher com visual de ingresso de show dos anos 80. Colaboradores do SINDSERM
 * ganham o "passe da casa", no metal da categoria (diretoria em platina,
 * funcionários em dourado, prestadores em ciano), para não confundir com o
 * voucher dos filiados. Componente puro (servidor ou cliente).
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
        "voucher-card relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border-2 bg-[#0e0e0f] text-fg print:border-black print:bg-white print:text-black print:shadow-none",
        // Inscrição na hora: o voucher é amarelo (kit da gordura), para a mesa dos kits reconhecer de longe.
        card.walkIn
          ? "border-[#ffd23f]/85 shadow-[0_0_46px_-16px_rgb(255_210_63/0.6),0_30px_60px_-30px_rgb(0_0_0/0.9)]"
          : "border-red/60 shadow-[0_0_46px_-18px_var(--glow),0_30px_60px_-30px_rgb(0_0_0/0.9)]",
        className,
      )}
      aria-label={`Voucher de ${card.fullName}`}
      data-testid="voucher-card"
      data-walk-in={card.walkIn ? "true" : undefined}
    >
      <div className="relative bg-ink print:bg-white">
        <FestaEmblem className="mx-auto w-[82%] pt-2" sizes="320px" eager={eager} />
        <div className="voucher-card-fade absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0e0e0f] to-transparent print:hidden" />
      </div>
      {card.walkIn ? (
        <p
          className="pixel relative bg-[#ffd23f] py-2 text-center text-[0.62rem] text-[#1a1033] print:border-y print:border-black"
          data-testid="voucher-walk-in"
        >
          Inscrição na hora · kit da gordura
        </p>
      ) : null}

      <div className="relative px-5 pt-1 pb-4">
        <div className="flex items-center justify-between gap-2">
          <PlayerTag player={isMember ? 1 : 2} />
          <span className="pixel text-[0.5rem] text-fg-muted print:text-black">{GAME.admitOne}</span>
        </div>
        <h3 className="display mt-3 text-[1.9rem] break-words text-fg print:text-black" data-testid="voucher-name">
          {card.fullName}
        </h3>
        <p className="mt-1 text-sm font-semibold text-fg-muted print:text-black">
          {isMember ? (
            card.isTeacher ? (
              T.personAffiliated
            ) : (
              "Filiado(a) ao SINDSERM"
            )
          ) : (
            <>
              Convidado(a) de <span className="text-fg print:text-black">{card.hostName ? properName(card.hostName) : null}</span>
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
          {card.walkIn ? (
            <Note tone="warning" icon={Zap} testId="voucher-walk-in-note">
              <strong className="font-bold">Inscrição feita na hora:</strong> o seu kit é o da gordura.{" "}
              {event.kitsAtDesk ? "Pegue na mesa dos kits, depois da entrada." : "Ele sai na entrada, como o de todo mundo."}
            </Note>
          ) : null}
          {isMember ? <MemberNotes card={card} active={active} kitDeadline={event.kitDeadlineLabel} /> : null}
          {!isMember && card.kitWaitlist?.self ? (
            <Note tone="warning" icon={Hourglass} testId="voucher-guest-kit">
              <strong className="font-bold">Seu kit está na fila do kit (nº {card.kitWaitlist.self}).</strong> Os kits acabaram antes
              da sua inscrição: se vagar, ele sai na recepção, por ordem.
              {event.kitDeadlineLabel
                ? ` Na festa, depois das ${event.kitDeadlineLabel}, os kits de quem não veio saem por ordem de chegada, enquanto houver.`
                : ""}{" "}
              A entrada está garantida.
            </Note>
          ) : !isMember && EDITION.sharedKit && !card.hostIsEmployee ? (
            // Kit dividido: o convidado de filiado(a) não tem kit próprio; o de quem convidou é para os dois.
            <Note tone="red" icon={Gift} testId="voucher-guest-kit">
              <strong className="font-bold">Kit dividido:</strong> o kit de consumação de {card.hostName ? properName(card.hostName) : "quem te convidou"} é
              para vocês dois. Ele sai na entrada de {card.hostName ? properName(card.hostName) : "quem te convidou"}.
            </Note>
          ) : !isMember ? (
            <Note tone="red" icon={Gift} testId="voucher-guest-kit">
              <strong className="font-bold">Você tem direito a um kit de consumação.</strong>{" "}
              {event.kitsAtDesk ? (
                "Pegue na mesa dos kits, depois da sua entrada (não precisa esperar quem te convidou)."
              ) : (
                <>
                  Ele é entregue na recepção depois que {card.hostName ? properName(card.hostName) : "quem te convidou"} chegar.
                </>
              )}
              {event.kitDeadlineLabel ? ` Seu kit fica guardado até as ${event.kitDeadlineLabel}.` : ""}
            </Note>
          ) : null}
        </div>
      </div>

      <VoucherFooter helpWhatsapp={event.helpWhatsapp} />
    </article>
  );
}

/** O "metal" do passe da casa de cada categoria: a portaria reconhece de longe. */
const METAL: Record<EmployeeCategory, { card: string; band: string; text: string; tag: string; edge: string }> = {
  BOARD: {
    card: "border-[#e4e4e7]/85 shadow-[0_0_46px_-16px_rgb(255_255_255/0.5),0_30px_60px_-30px_rgb(0_0_0/0.9)]",
    band: "bg-[linear-gradient(90deg,#9f9fa8,#fafafa_45%,#d4d4d8)] text-ink",
    text: "text-[#f4f4f5]",
    tag: "bg-[#e4e4e7] text-ink",
    edge: "border-[#e4e4e7]/70",
  },
  STAFF: {
    card: "border-warning/80 shadow-[0_0_46px_-16px_rgb(248_192_0/0.6),0_30px_60px_-30px_rgb(0_0_0/0.9)]",
    band: "bg-[linear-gradient(90deg,#c99400,#ffd84a_45%,#f8c000)] text-warning-foreground",
    text: "text-warning",
    tag: "bg-warning text-warning-foreground",
    edge: "border-warning/70",
  },
  CONTRACTOR: {
    card: "border-[#22d3ee]/80 shadow-[0_0_46px_-16px_rgb(34_211_238/0.55),0_30px_60px_-30px_rgb(0_0_0/0.9)]",
    band: "bg-[linear-gradient(90deg,#0e7490,#67e8f9_45%,#22d3ee)] text-ink",
    text: "text-[#67e8f9]",
    tag: "bg-[#22d3ee] text-ink",
    edge: "border-[#22d3ee]/70",
  },
  // Cortesia da organização: rosa-neon, a outra cor da arte da festa.
  COURTESY: {
    card: "border-[#ff4fb4]/80 shadow-[0_0_46px_-16px_rgb(255_79_180/0.6),0_30px_60px_-30px_rgb(0_0_0/0.9)]",
    band: "bg-[linear-gradient(90deg,#be185d,#ff9ad5_45%,#ff4fb4)] text-ink",
    text: "text-[#ff8fd0]",
    tag: "bg-[#ff4fb4] text-ink",
    edge: "border-[#ff4fb4]/70",
  },
};

/** Voucher de colaborador(a) do SINDSERM: o "passe da casa", diferente do voucher dos filiados. */
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
  const category: EmployeeCategory = card.category ?? "STAFF";
  const metal = METAL[category];
  const courtesy = category === "COURTESY";
  return (
    <article
      className={cn(
        "voucher-card relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border-2 bg-[#0e0e0f] text-fg print:border-black print:bg-white print:text-black print:shadow-none",
        metal.card,
        className,
      )}
      aria-label={`Voucher de ${EMPLOYEE_CATEGORY_TITLE[category]}: ${card.fullName}`}
      data-testid="voucher-card"
      data-kind={courtesy ? "courtesy" : "employee"}
      data-category={category}
    >
      <div className="relative bg-ink print:bg-white">
        <FestaEmblem className="mx-auto w-[82%] pt-2" sizes="320px" eager={eager} />
        <div className="voucher-card-fade absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0e0e0f] to-transparent print:hidden" />
      </div>
      {/* Faixa no metal da categoria: é assim que a portaria reconhece de longe o passe da casa. */}
      <div className={cn("flex items-center justify-between px-5 py-2 print:border-y print:border-black print:bg-none", metal.band)}>
        <span className="pixel flex items-center gap-1.5 text-[0.7rem]">
          {courtesy ? (
            <>
              <Heart className="size-3.5" /> Cortesia
            </>
          ) : (
            <>
              <Star className="size-3.5" /> Passe da casa
            </>
          )}
        </span>
        <span className="pixel text-[0.55rem]">SINDSERM</span>
      </div>

      <div className="relative px-5 pt-3 pb-4">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("pixel inline-flex items-center rounded-[4px] px-1.5 py-1 text-[0.55rem] leading-none", metal.tag)} data-testid="voucher-category">
            {courtesy ? "Convidado(a)" : EMPLOYEE_CATEGORY_LABEL[category]}
          </span>
          <span className="pixel text-[0.5rem] text-fg-muted print:text-black">{GAME.admitOne}</span>
        </div>
        <h3 className="display mt-3 text-[1.9rem] break-words text-fg print:text-black" data-testid="voucher-name">
          {card.fullName}
        </h3>
        <p className={cn("mt-1 text-sm font-semibold print:text-black", metal.text)} data-testid="voucher-job">
          {card.broughtByName ? `Convidado(a) de ${properName(card.broughtByName)}` : employeeTitleLine(category, card.jobTitle)}
        </p>
      </div>

      <Perforation tone="warning" edgeClassName={metal.edge} />

      <div className="flex flex-col items-center px-5 pt-3 pb-5">
        <QrBlock card={card} event={event} />
        <div className="mt-4 w-full space-y-2 text-sm">
          {card.checkedInAt ? (
            <Note tone="success" icon={Login}>
              Entrada registrada {formatShortDateTime(card.checkedInAt)}
            </Note>
          ) : null}
          {card.withoutKit ? (
            <Note tone="neutral" icon={Info} testId="voucher-employee-kit">
              <strong className="font-bold">Entrada sem kit de consumação.</strong> É só mostrar o QR Code na portaria.
            </Note>
          ) : (
            <Note tone="warning" icon={Gift} testId="voucher-employee-kit">
              <strong className="font-bold">{card.guestName ? "2 kits de consumação" : "1 kit de consumação"}</strong>
              {card.guestName ? (
                <>
                  {" "}
                  — o seu e o de <span data-testid="voucher-guest-name">{properName(card.guestName)}</span>
                </>
              ) : null}
              .{" "}
              {card.guestName
                ? "O seu sai na recepção, junto com a sua entrada; o do convidado, depois que você chegar."
                : "Entregue na recepção, junto com a sua entrada."}
              {event.kitDeadlineLabel ? ` Seu kit fica guardado até as ${event.kitDeadlineLabel}.` : ""}
            </Note>
          )}
        </div>
      </div>

      <VoucherFooter helpWhatsapp={event.helpWhatsapp} />
    </article>
  );
}

/** Picote do ingresso. */
function Perforation({ tone, edgeClassName }: { tone: "red" | "warning"; edgeClassName?: string }) {
  const edge = edgeClassName ?? (tone === "red" ? "border-red/60" : "border-warning/70");
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
  // Kit dividido: com convidado, o kit é um só, para os dois.
  const shared = EDITION.sharedKit && Boolean(card.guestName);
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
      {card.isTeacher && card.kitWaitlist?.self ? (
        <Note tone="warning" icon={Hourglass} testId="voucher-kits">
          <strong className="font-bold">
            {card.kitWaitlist.guest ? "Seus kits estão na fila do kit" : shared ? "O kit de vocês dois está na fila do kit" : "Seu kit está na fila do kit"} (nº{" "}
            {card.kitWaitlist.self}).
          </strong>{" "}
          Os kits acabaram antes da sua inscrição: se vagar kit (alguém desistir ou o SINDSERM comprar mais), ele sai na recepção, por
          ordem de inscrição.
          {kitDeadline ? ` Na festa, depois das ${kitDeadline}, os kits de quem não veio saem por ordem de chegada, enquanto houver.` : ""} A
          sua entrada está garantida.
        </Note>
      ) : card.isTeacher && card.kitWaitlist?.guest ? (
        <Note tone="warning" icon={Hourglass} testId="voucher-kits">
          <strong className="font-bold">O seu kit está garantido; o de {card.guestName ? properName(card.guestName) : "seu convidado"} está na fila do kit (nº {card.kitWaitlist.guest}).</strong>{" "}
          Se vagar, sai na recepção, por ordem de inscrição
          {kitDeadline ? `; depois das ${kitDeadline}, se sobrar, por ordem de chegada. O seu fica guardado até as ${kitDeadline}.` : "."}
        </Note>
      ) : card.isTeacher && shared ? (
        <Note tone="red" icon={Gift} testId="voucher-kits">
          <strong className="font-bold">1 kit de consumação</strong> — para você e{" "}
          <span data-testid="voucher-guest-name">{properName(card.guestName!)}</span> dividirem.{" "}
          {status === "AWAITING_SIGNATURE"
            ? "Liberado depois que você assinar a ficha. "
            : !active && status !== "REJECTED"
              ? "Liberado depois que o SINDSERM confirmar a sua filiação. "
              : ""}
          Entregue na recepção, junto com a sua entrada.
          {kitDeadline ? ` O kit fica guardado até as ${kitDeadline}.` : ""}
        </Note>
      ) : card.isTeacher ? (
        <Note tone="red" icon={Gift} testId="voucher-kits">
          <strong className="font-bold">{card.guestName ? "2 kits de consumação" : "1 kit de consumação"}</strong>
          {card.guestName ? (
            <>
              {" "}
              — o seu e o de <span data-testid="voucher-guest-name">{properName(card.guestName)}</span>
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
          {kitDeadline ? ` Seu kit fica guardado até as ${kitDeadline}.` : ""}
        </Note>
      ) : (
        <Note tone="neutral" icon={Info}>
          Você participa da festa sem kit de consumação (o kit é só para {T.people}).
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
