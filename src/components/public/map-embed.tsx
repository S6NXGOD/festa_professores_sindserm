"use client";

import { useState } from "react";
import { MapFold } from "@/components/icons/pixel";

/**
 * Mapa do Google carregado só quando a pessoa pede: economiza dados no celular
 * e não chama o Google para quem só quer ler a página.
 */
export function MapEmbed({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <iframe
        src={src}
        title={title}
        className="block aspect-[4/3] w-full border-0 bg-ink sm:aspect-[21/9]"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group relative flex aspect-[21/9] min-h-36 w-full items-center justify-center overflow-hidden bg-ink text-fg outline-none focus-visible:ring-[3px] focus-visible:ring-red/50 focus-visible:ring-inset"
      data-testid="venue-map-load"
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(rgb(255_38_38/0.16)_1px,transparent_1px),linear-gradient(90deg,rgb(255_38_38/0.16)_1px,transparent_1px)] bg-[size:28px_28px] transition-opacity group-hover:opacity-70"
      />
      <span className="relative flex flex-col items-center gap-2 px-4 text-center">
        <MapFold className="size-9 text-red transition-transform group-hover:-translate-y-0.5" />
        <span className="display text-2xl">Ver o mapa aqui</span>
        <span className="text-xs text-fg-muted">Toque para carregar o Google Maps</span>
      </span>
    </button>
  );
}
