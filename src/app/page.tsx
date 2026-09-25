import Link from "next/link";
import { FestaEmblem } from "@/components/brand/brand";
import {
  ArrowRight,
  Calendar,
  Clock,
  ClipboardNote,
  Gift,
  Login,
  QrCode,
  Settings,
  Teach,
  UserPlus,
} from "@/components/icons/pixel";
import { Reveal } from "@/components/motion/reveal";
import { PublicShell } from "@/components/public/public-shell";
import { StickyCta } from "@/components/public/sticky-cta";
import { VenueSection } from "@/components/public/venue";
import { PixelTag, TapeLabel } from "@/components/retro/bits";
import { Countdown } from "@/components/retro/countdown";
import { Marquee } from "@/components/retro/marquee";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { APP_NAME, getEventInfo, getRegistrationWindow, hasUsers } from "@/server/queries/config";

export default async function HomePage() {
  const [event, window, usersExist] = await Promise.all([getEventInfo(), getRegistrationWindow(), hasUsers()]);

  if (!usersExist || !event) {
    return (
      <PublicShell eventName={event?.name ?? APP_NAME}>
        <Reveal className="mx-auto max-w-lg text-center">
          <FestaEmblem eager className="mx-auto max-w-md" />
          <p className="pixel mt-6 text-xs text-red neon-red">
            Insert coin<span className="animate-blink">_</span>
          </p>
          <h1 className="display mt-4 text-4xl text-fg">Inscrições em breve</h1>
          <p className="mt-3 text-fg-muted">A festa ainda está sendo preparada pela organização do SINDSERM. Volte mais tarde.</p>
          {!usersExist ? (
            <Button asChild variant="outline" className="mt-6">
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
    "Cada professor(a) leva 1 convidado",
    event.kitDeadline ? `Kits até ${event.kitDeadline.label}` : "Kit de consumação para professoras e professores",
  ];

  const levels = [
    {
      icon: UserPlus,
      title: "Faça a inscrição",
      text: "Seus dados e, se quiser, o seu convidado — o seu Player 2. Leva 2 minutos.",
    },
    {
      icon: QrCode,
      title: "Receba os vouchers",
      text: "Um QR Code para você e outro para o convidado. Salve no celular ou imprima.",
    },
    {
      icon: Gift,
      title: "Curta a festa",
      text: "Mostre o QR na entrada. Depois de entrar, retire os kits de consumação.",
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
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="display mt-5 text-[2.9rem] leading-[0.88] sm:text-6xl">
              <span className="chrome block">{event.name}</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1} className="mt-5 flex flex-wrap gap-2">
            <InfoChip icon={Calendar} text={event.dateLongLabel} />
            <InfoChip icon={Clock} text={event.timeLabel} />
            {event.kitDeadline ? <InfoChip icon={Gift} text={`Kits até ${event.kitDeadline.label}`} /> : null}
          </Reveal>
          {event.description ? (
            <Reveal delay={0.15}>
              <p className="mt-5 max-w-xl text-base leading-relaxed whitespace-pre-line text-fg-muted">{event.description}</p>
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
          {event.startsAt ? (
            <Reveal delay={0.25} className="mt-8">
              <Countdown target={event.startsAt} label="A pista abre em" align="start" />
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
              <Teach className="size-6" />
              <p className="display text-xl">Festa das professoras e professores</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              O kit de consumação é para professoras e professores filiados(as): um para você e outro para o seu convidado. O
              seu sai na recepção, junto com a sua entrada; o do convidado, depois que você chegar. Filiados(as) que não são
              professoras ou professores também podem participar, sem kit.
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
              Preencha a ficha de filiação na própria inscrição. Na recepção da festa, é só assinar a autorização do desconto.
              Qualquer servidor(a) pode se filiar; o kit de consumação é só para professoras e professores.
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

function InfoChip({ icon: Icon, text }: { icon: typeof Calendar; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-line bg-surface/80 px-3 py-2 text-sm font-semibold text-fg first-letter:uppercase">
      <Icon className="size-4 text-red" />
      <span className="first-letter:uppercase">{text}</span>
    </span>
  );
}
