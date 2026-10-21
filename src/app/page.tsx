import Link from "next/link";
import { FestaEmblem } from "@/components/brand/brand";
import { AdminHelp } from "@/components/help/help";
import {
  ArrowRight,
  Calendar,
  Clock,
  ClipboardNote,
  Gift,
  Hourglass,
  Login,
  QrCode,
  Settings,
  Sun,
  Teach,
  UserPlus,
} from "@/components/icons/pixel";
import { Reveal } from "@/components/motion/reveal";
import { PublicShell } from "@/components/public/public-shell";
import { StickyCta } from "@/components/public/sticky-cta";
import { VenueSection } from "@/components/public/venue";
import { PixelTag, TapeLabel } from "@/components/retro/bits";
import { Countdown, DeadlineTimer } from "@/components/retro/countdown";
import { KitsSoldOutBanner } from "@/components/registration/kit-waitlist-notice";
import { Marquee } from "@/components/retro/marquee";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { splitEventName } from "@/lib/text";
import { kitsSoldOut } from "@/domain/kit-supply";
import { db } from "@/server/db";
import { APP_NAME, getConfig, getEventInfo, getRegistrationWindow, hasUsers } from "@/server/queries/config";
import { getKitSupply } from "@/server/services/kit-waitlist";
import { EDITION, GAME, T } from "@/domain/edition";

export default async function HomePage() {
  const [event, window, usersExist, kitSupply, config] = await Promise.all([
    getEventInfo(),
    getRegistrationWindow(),
    hasUsers(),
    getKitSupply(db),
    getConfig(),
  ]);

  if (!usersExist || !event) {
    return (
      <PublicShell eventName={event?.name ?? APP_NAME}>
        <Reveal className="mx-auto max-w-lg text-center">
          <FestaEmblem eager className="mx-auto max-w-md" />
          <p className="pixel mt-6 text-xs text-red neon-red">
            {GAME.insertCoin}<span className="animate-blink">_</span>
          </p>
          <h1 className="display mt-4 text-4xl text-fg">Inscrições em breve</h1>
          <p className="mt-3 text-fg-muted">A festa ainda está sendo preparada pela organização do SINDSERM. Volte mais tarde.</p>
          {!usersExist ? (
            <Button asChild variant="outline" className="mt-6 bg-ink/85 backdrop-blur-sm">
              <Link href="/setup">
                <Settings /> Configurar o sistema
              </Link>
            </Button>
          ) : null}
        </Reveal>
      </PublicShell>
    );
  }

  const open = window.state === "OPEN";
  const heading = splitEventName(event.name);
  const soldOut = open && kitsSoldOut(kitSupply);
  // Poucos kits livres (até o limite de alerta do estoque): o site avisa quantos restam.
  const freeKits = kitSupply?.member ?? null;
  const lastKits = open && freeKits !== null && freeKits >= 1 && freeKits <= (config?.lowStockThreshold ?? 0) ? freeKits : null;
  const closingSoon = window.state === "OPEN" && closesWithinADay(window.closesAt);
  const statusLine =
    window.state === "OPEN"
      ? `Inscrições abertas até ${formatDateTime(window.closesAt)}`
      : window.state === "NOT_OPEN"
        ? `Inscrições a partir de ${formatDateTime(window.opensAt)}`
        : "Inscrições encerradas";

  const marquee = [
    event.name,
    `${event.dateLabel} · ${event.timeLabel}`,
    statusLine,
    `Cada ${T.person} leva 1 convidado`,
    event.kitDeadline ? `Kit guardado até ${event.kitDeadline.label}` : `Kit de consumação para ${T.people}`,
  ];

  const levels = [
    {
      icon: UserPlus,
      title: "Faça a inscrição",
      text: `Seus dados e, se quiser, o seu convidado — o seu ${GAME.player2Name}. Leva 2 minutos.`,
    },
    {
      icon: QrCode,
      title: "Receba os vouchers",
      text: "Um QR Code para você e outro para o convidado. Salve no celular ou imprima.",
    },
    {
      icon: Gift,
      title: "Curta a festa",
      text: event.kitsAtDesk
        ? "Mostre o QR na entrada e pegue o seu kit de consumação na mesa dos kits, logo depois."
        : "Mostre o QR na entrada: o seu kit de consumação sai na hora, junto com a entrada.",
    },
  ];

  return (
    <PublicShell eventName={event.name} wide backdrop="hero" help={open ? { className: "bottom-28 sm:bottom-6" } : undefined} bottomBar={open}>
      <Marquee items={marquee} className="-mx-4 -mt-4 mb-6 sm:mx-0 sm:rounded-lg sm:border" />

      <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-10">
        <Reveal className="relative order-1 md:order-2">
          <FestaEmblem eager className="mx-auto max-w-[34rem] animate-float [--float-rotate:0deg] [animation-duration:9s]" />
        </Reveal>

        <div className="order-2 md:order-1">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-ink/70 px-3 py-1.5 text-xs font-bold tracking-wide text-fg-muted uppercase">
              <span className={open ? "size-2 animate-blink rounded-[2px] bg-success shadow-[0_0_8px_var(--success)]" : "size-2 rounded-[2px] bg-fg-dim"} />
              {statusLine}
            </span>
            {/* Último dia: quanto falta para fechar (depois, o formulário recusa). */}
            {closingSoon ? (
              <p className="mt-2 flex items-center gap-2 text-xs font-bold tracking-wide text-warning uppercase" data-testid="home-closing-soon">
                <Clock className="size-4" /> Fecham em
                <DeadlineTimer deadline={window.closesAt} doneLabel="AGORA" className="text-xs text-warning" />
              </p>
            ) : null}
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="display mt-5 text-[2.9rem] leading-[0.88] sm:text-6xl">
              <span className="chrome block">{heading.title}</span>
              {heading.tagline ? (
                <>
                  <span className="sr-only"> – </span>
                  {/* Fita de papel como a faixa do cartaz: quem faz a festa. */}
                  <TapeLabel className="mt-4 text-[1.35rem] sm:text-3xl" rotate={-2}>
                    {heading.tagline}
                  </TapeLabel>
                </>
              ) : null}
            </h1>
          </Reveal>
          <Reveal delay={0.1} className="mt-5 flex flex-wrap gap-2">
            <InfoChip icon={Calendar} text={event.dateLongLabel} />
            <InfoChip icon={Clock} text={event.timeLabel} />
            {event.kitDeadline ? <InfoChip icon={Gift} text={`Kit guardado até ${event.kitDeadline.label}`} /> : null}
            {lastKits ? (
              <span
                className="inline-flex items-center gap-2 rounded-md border border-warning/60 bg-warning-soft px-3 py-2 text-sm font-semibold text-fg"
                data-testid="home-last-kits"
              >
                <Hourglass className="size-4 animate-wiggle text-warning" />
                {lastKits === 1 ? "Último kit livre: garanta o seu" : `Últimos ${lastKits} kits livres: garanta o seu`}
              </span>
            ) : null}
          </Reveal>
          {event.description ? (
            <Reveal delay={0.15}>
              <p className="mt-5 max-w-xl text-base leading-relaxed whitespace-pre-line text-fg-muted">{event.description}</p>
            </Reveal>
          ) : null}

          {/* Kits esgotados: a inscrição continua, com a fila do kit (o formulário explica e pede a confirmação). */}
          {soldOut ? (
            <Reveal delay={0.18} className="mt-6 max-w-xl">
              <KitsSoldOutBanner testId="home-kits-sold-out" deadlineLabel={event.kitDeadline?.label ?? null} />
            </Reveal>
          ) : null}
          <Reveal delay={0.2} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {open ? (
              <Button asChild size="xl" className="w-full sm:w-auto" data-testid="cta-inscricao">
                <Link href="/inscricao" id="cta-inscricao">
                  <Login /> Fazer minha inscrição <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button size="xl" disabled className="w-full sm:w-auto">
                {window.state === "CLOSED" ? "Inscrições encerradas" : "Inscrições em breve"}
              </Button>
            )}
          </Reveal>
          {window.state === "CLOSED" ? (
            <Reveal delay={0.21} className="mt-4 max-w-md">
              <AdminHelp topic="tirar uma dúvida sobre a inscrição (as inscrições já encerraram)" />
            </Reveal>
          ) : null}
          <Reveal delay={0.22} className="mt-4">
            <Link
              href="/vouchers"
              className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-fg-muted underline-offset-4 outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-red"
              data-testid="recover-link"
            >
              <QrCode className="size-4 text-red" /> Já se inscreveu? Recuperar meus vouchers
            </Link>
          </Reveal>
          {event.startsAt ? (
            <Reveal delay={0.25} className="mt-8">
              <Countdown target={event.startsAt} label={GAME.countdownLabel} align="start" />
            </Reveal>
          ) : null}
        </div>
      </section>

      {/* Celular: a inscrição sempre à mão (barra fixa quando o botão principal sai da tela). */}
      {open ? <StickyCta targetId="cta-inscricao" caption={statusLine} /> : null}

      {event.venue ? <VenueSection venue={event.venue} className="mt-16" /> : null}

      <section className="mt-16">
        <div className="mb-6 flex items-center gap-3">
          <TapeLabel>Como funciona</TapeLabel>
        </div>
        <ol className="grid gap-4 sm:grid-cols-3">
          {levels.map((level, index) => (
            <Reveal key={level.title} delay={0.05 + index * 0.06}>
              <li className="group h-full rounded-2xl border border-line bg-gradient-to-b from-surface to-ink-2 p-5 transition-[border-color,box-shadow] hover:border-red/50 hover:shadow-[0_0_30px_-16px_var(--glow)]">
                <div className="flex items-center justify-between">
                  <PixelTag tone={index === 0 ? "red" : "neutral"}>{`Fase ${index + 1}`}</PixelTag>
                  <level.icon className="size-7 text-red transition-transform group-hover:-translate-y-0.5" />
                </div>
                <h2 className="display mt-4 text-2xl text-fg">{level.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{level.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Reveal delay={0.1}>
          <div className="h-full rounded-2xl border border-red/40 bg-[linear-gradient(135deg,rgb(227_0_15/0.18),transparent_60%)] p-5">
            <div className="flex items-center gap-2 text-red">
              {EDITION.askTeacher ? <Teach className="size-6" /> : <Sun className="size-6" />}
              <p className="display text-xl">{T.partyOf}</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              O kit de consumação é para {T.peopleAffiliated}: um para você e outro para o seu convidado.{" "}
              {event.kitsAtDesk
                ? "Os kits saem na mesa dos kits, logo depois da entrada (o do convidado não precisa esperar você)."
                : "O seu sai na recepção, junto com a sua entrada; o do convidado, depois que você chegar."}
              {EDITION.askTeacher ? ` Filiados(as) que não são ${T.people.replace(" e ", " ou ")} também podem participar, sem kit.` : ""}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Os kits ficam com quem se inscreve primeiro. Se acabarem, a inscrição continua e o kit entra na fila (sai se vagar).
              {event.kitDeadline
                ? ` Chegue até as ${event.kitDeadline.label}: até lá o seu kit fica guardado; depois, os que sobrarem saem por ordem de chegada.`
                : ""}
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="h-full rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-2 text-fg">
              <ClipboardNote className="size-6 text-red" />
              <p className="display text-xl">Ainda não é filiado(a)?</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Preencha a ficha de filiação na própria inscrição. Na recepção da festa, é só assinar a autorização do desconto.{" "}
              {EDITION.askTeacher
                ? `Qualquer servidor(a) pode se filiar; o kit de consumação é só para ${T.people}.`
                : "Qualquer servidor(a) pode se filiar e já ganha o kit de consumação e 1 convidado."}
            </p>
            {open ? (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/inscricao?ficha=1">
                  Preencher minha ficha <ArrowRight />
                </Link>
              </Button>
            ) : null}
          </div>
        </Reveal>
      </section>
    </PublicShell>
  );
}

/** Últimas 24 horas de inscrição: a faixa de status mostra quanto falta. */
function closesWithinADay(closesAt: Date) {
  return closesAt.getTime() - Date.now() < 24 * 3600 * 1000;
}

function InfoChip({ icon: Icon, text }: { icon: typeof Calendar; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-line bg-surface/80 px-3 py-2 text-sm font-semibold text-fg first-letter:uppercase">
      <Icon className="size-4 text-red" />
      <span className="first-letter:uppercase">{text}</span>
    </span>
  );
}
