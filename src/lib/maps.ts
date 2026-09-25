/**
 * Local da festa no Google Maps, sem chave de API. O administrador cola o que
 * tiver: o link do botão "Compartilhar", o link de um lugar ou o código de
 * "Incorporar um mapa" (o <iframe>).
 */

export interface VenueLocation {
  name: string | null;
  address: string | null;
  mapsUrl: string | null;
}

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

function isGoogleMapsUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return true;
  if (host === "goo.gl") return url.pathname.startsWith("/maps");
  if (host === "maps.google.com" || /^maps\.google\.[a-z.]+$/.test(host)) return true;
  return /^(www\.)?google\.[a-z.]+$/.test(host) && url.pathname.startsWith("/maps");
}

/** Normaliza o que foi colado. `url: null` = campo vazio. */
export function normalizeMapsInput(raw: string): { ok: true; url: string | null } | { ok: false } {
  const text = raw.trim();
  if (!text) return { ok: true, url: null };
  const iframe = /<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(text);
  const candidate = (iframe ? iframe[1]! : text).replace(/&amp;/g, "&");
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "https:" || !isGoogleMapsUrl(url)) return { ok: false };
  return { ok: true, url: url.toString() };
}

/** Links curtos (maps.app.goo.gl) não trazem coordenadas: vale resolver o redirecionamento. */
export function isShortMapsUrl(value: string): boolean {
  try {
    return SHORT_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Coordenadas do pino: "!3d<lat>!4d<lng>" (lugar) ou "@<lat>,<lng>" (centro da tela). */
export function mapsCoordinates(value: string): { lat: string; lng: string } | null {
  const pin = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(value);
  if (pin) return { lat: pin[1]!, lng: pin[2]! };
  const view = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(value);
  if (view) return { lat: view[1]!, lng: view[2]! };
  const query = /[?&](?:q|query|ll)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(value);
  return query ? { lat: query[1]!, lng: query[2]! } : null;
}

function isEmbedUrl(value: string) {
  try {
    return new URL(value).pathname.startsWith("/maps/embed");
  } catch {
    return false;
  }
}

function searchText(venue: VenueLocation) {
  return [venue.name, venue.address].filter(Boolean).join(", ");
}

/** Endereço do mapa embutido (iframe). Nulo quando não há nada para localizar. */
export function mapsEmbedUrl(venue: VenueLocation): string | null {
  if (venue.mapsUrl && isEmbedUrl(venue.mapsUrl)) return venue.mapsUrl;
  const coords = venue.mapsUrl ? mapsCoordinates(venue.mapsUrl) : null;
  const query = coords ? `${coords.lat},${coords.lng}` : searchText(venue);
  if (!query) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&hl=pt-BR&output=embed`;
}

/** Link "Abrir no Google Maps" (no celular abre o aplicativo, com a rota). */
export function mapsOpenUrl(venue: VenueLocation): string | null {
  if (venue.mapsUrl && !isEmbedUrl(venue.mapsUrl)) return venue.mapsUrl;
  const coords = venue.mapsUrl ? mapsCoordinates(venue.mapsUrl) : null;
  const query = coords ? `${coords.lat},${coords.lng}` : searchText(venue);
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
