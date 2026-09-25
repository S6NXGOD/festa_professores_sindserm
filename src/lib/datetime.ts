/** Fuso do evento (datas exibidas e período de inscrições). */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "America/Sao_Paulo";

const LOCALE = "pt-BR";

function partsInZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function zoneOffsetMs(date: Date, timeZone: string) {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * Converte um horário "de parede" (ex.: valor de <input type="datetime-local">,
 * "2026-10-15T19:00") no fuso informado para um instante UTC.
 */
export function zonedLocalToUtc(local: string, timeZone = APP_TIME_ZONE): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  const second = guess - zoneOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** Instante UTC -> "YYYY-MM-DDTHH:mm" no fuso (para preencher inputs). */
export function utcToZonedLocalInput(date: Date, timeZone = APP_TIME_ZONE): string {
  const p = partsInZone(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

/** Data e hora curtas: "15/10 às 19:32". */
export function formatShortDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const day = new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  return `${day} às ${formatTime(d)}`;
}

/** Datas "somente dia" (YYYY-MM-DD) sem conversão de fuso. */
function plainDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12));
}

export function formatPlainDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", dateStyle: "short" }).format(
    plainDate(value),
  );
}

export function formatPlainDateLong(value: string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(plainDate(value));
}

/** "19:00:00" -> "19h" / "19:30:00" -> "19h30" */
export function formatClock(value: string | null | undefined): string {
  if (!value) return "";
  const [h, m] = value.split(":");
  return m && m !== "00" ? `${Number(h)}h${m}` : `${Number(h)}h`;
}

/** "2026-11" -> "11/2026" */
export function formatMonthYear(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m] = value.split("-");
  return `${m}/${y}`;
}

/** Data de hoje (YYYY-MM-DD) no fuso do evento. */
export function todayInZone(timeZone = APP_TIME_ZONE): string {
  return utcToZonedLocalInput(new Date(), timeZone).slice(0, 10);
}
