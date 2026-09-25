import { Directions, ExternalLink, MapPin } from "@/components/icons/pixel";
import { PixelTag, TapeLabel } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VenueInfo } from "@/server/queries/config";
import { MapEmbed } from "./map-embed";

function VenuePhoto({ venue, className }: { venue: VenueInfo; className?: string }) {
  if (!venue.photo) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- já chega reduzida e em WEBP (sem otimizador)
    <img
      src={venue.photo.url}
      width={venue.photo.width}
      height={venue.photo.height}
      alt={venue.name ? `Foto do local: ${venue.name}` : "Foto do local da festa"}
      loading="lazy"
      decoding="async"
      className={cn("object-cover", className)}
    />
  );
}

function MapsButton({ venue, className }: { venue: VenueInfo; className?: string }) {
  if (!venue.openUrl) return null;
  return (
    <Button asChild className={className}>
      <a href={venue.openUrl} target="_blank" rel="noopener noreferrer" data-testid="venue-open-maps">
        <Directions /> Como chegar
      </a>
    </Button>
  );
}

/** Seção "O local" da página inicial: foto, nome, endereço, descrição e mapa. */
export function VenueSection({ venue, className }: { venue: VenueInfo; className?: string }) {
  const title = venue.name ?? "Onde vai ser";
  return (
    <section className={className} aria-labelledby="venue-title" data-testid="venue-section">
      <div className="mb-6 flex items-center gap-3">
        <TapeLabel>O local</TapeLabel>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_60px_-40px_rgb(0_0_0/0.9)]">
        <div className={cn("grid grid-cols-1", venue.photo && "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]")}>
          {venue.photo ? (
            <div className="relative">
              <VenuePhoto venue={venue} className="aspect-[16/10] w-full md:absolute md:inset-0 md:aspect-auto md:h-full" />
              <div aria-hidden className="scanlines pointer-events-none absolute inset-0 opacity-25" />
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/70 to-transparent" />
              <PixelTag tone="red" className="absolute top-3 left-3">
                O local
              </PixelTag>
            </div>
          ) : null}
          <div className="flex flex-col p-5 sm:p-6">
            <h2 id="venue-title" className="display text-3xl text-fg sm:text-4xl">
              {title}
            </h2>
            {venue.address ? (
              <p className="mt-3 flex items-start gap-2 font-semibold text-fg">
                <MapPin className="mt-0.5 size-5 text-red" />
                <span>{venue.address}</span>
              </p>
            ) : null}
            {venue.description ? (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-fg-muted">{venue.description}</p>
            ) : null}
            {venue.openUrl ? (
              <div className="mt-5 md:mt-auto md:pt-5">
                <MapsButton venue={venue} className="w-full sm:w-fit" />
              </div>
            ) : null}
          </div>
        </div>
        {venue.embedUrl ? (
          <div className="border-t border-line">
            <MapEmbed src={venue.embedUrl} title={`Mapa: ${title}`} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Cartão curto do local (inscrição e vouchers). */
export function VenueCompact({ venue, className }: { venue: VenueInfo; className?: string }) {
  const title = venue.name ?? venue.address ?? "Local da festa";
  return (
    <div
      className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface/90 p-3 text-left backdrop-blur", className)}
      data-testid="venue-compact"
    >
      {venue.photo ? (
        <VenuePhoto venue={venue} className="size-16 shrink-0 rounded-xl" />
      ) : (
        <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-xl bg-surface-3">
          <MapPin className="size-7 text-red" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="pixel text-[0.55rem] text-red">Onde vai ser</p>
        <p className="display truncate text-xl text-fg">{title}</p>
        {venue.name && venue.address ? <p className="truncate text-sm text-fg-muted">{venue.address}</p> : null}
      </div>
      {venue.openUrl ? (
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a href={venue.openUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir o local no Google Maps">
            Mapa <ExternalLink />
          </a>
        </Button>
      ) : null}
    </div>
  );
}
