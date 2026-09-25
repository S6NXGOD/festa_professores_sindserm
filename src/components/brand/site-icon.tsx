"use client";

import { createContext, useContext } from "react";
import { type IconSize, siteIconUrl } from "@/lib/site-icon";
import { cn } from "@/lib/utils";

// Versão do ícone vinda do layout raiz: trocar em Configurações atualiza todas as marcas.
const SiteIconContext = createContext<string | null>(null);

export function SiteIconProvider({ version, children }: { version: string; children: React.ReactNode }) {
  return <SiteIconContext value={version}>{children}</SiteIconContext>;
}

export function useSiteIconUrl(size: IconSize) {
  return siteIconUrl(size, useContext(SiteIconContext));
}

/** Ícone do site como marca (ao lado do nome da festa). */
export function SiteIconMark({ className, size = 128 }: { className?: string; size?: IconSize }) {
  const src = useSiteIconUrl(size);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ícone já no tamanho certo, servido por /icone
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      decoding="async"
      draggable={false}
      className={cn("size-10 shrink-0 rounded-lg bg-ink object-cover ring-1 ring-line-strong select-none", className)}
    />
  );
}
