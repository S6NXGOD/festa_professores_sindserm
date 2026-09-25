/*
 * Ícone do site (aba do navegador, tela inicial do celular e marca ao lado do
 * nome da festa). Servido por /icone em tamanhos fixos; a versão (?v=) muda a
 * cada troca, então o navegador guarda cada versão sem ficar desatualizado.
 */

export const ICON_SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** Menor tamanho da lista que cobre o pedido (acima de 512, fica o 512). */
export function iconSizeFor(requested: number): IconSize {
  return ICON_SIZES.find((size) => size >= requested) ?? 512;
}

export function siteIconUrl(size: IconSize, version?: string | null): string {
  return version ? `/icone?s=${size}&v=${encodeURIComponent(version)}` : `/icone?s=${size}`;
}
