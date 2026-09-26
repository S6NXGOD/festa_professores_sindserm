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

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Dia (YYYY-MM-DD) de um instante, no fuso do evento (para agrupar listas por dia). */
export function zonedDayKey(date: Date | string, timeZone = APP_TIME_ZONE): string {
  return utcToZonedLocalInput(new Date(date), timeZone).slice(0, 10);
}

/** Hora cheia (0–23) de um instante, no fuso do evento. */
export function zonedHour(date: Date | string, timeZone = APP_TIME_ZONE): number {
  return partsInZone(new Date(date), timeZone).hour;
}

/** "Hoje", "Ontem" ou "Qua. 23/09": cabeçalho de listas agrupadas por dia. */
export function formatDayHeading(dayKey: string, todayKey = todayInZone()): string {
  if (dayKey === todayKey) return "Hoje";
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const yesterday = new Date(Date.UTC(ty!, tm! - 1, td! - 1, 12)).toISOString().slice(0, 10);
  if (dayKey === yesterday) return "Ontem";
  const [y, m, d] = dayKey.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", weekday: "short" }).format(new Date(Date.UTC(y!, m! - 1, d!, 12)));
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${pad2(d!)}/${pad2(m!)}`;
}

/** "16/10/2026 19:42:05" (planilhas: com segundos, no fuso do evento). */
export function formatDateTimeSeconds(date: Date | string, timeZone = APP_TIME_ZONE): string {
  const p = partsInZone(new Date(date), timeZone);
  return `${pad2(p.day)}/${pad2(p.month)}/${p.year} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/** Agrupa uma lista (já ordenada) por dia no fuso do evento: "Hoje", "Ontem", "Qua. 23/09". */
export function groupByDay<T>(rows: T[], dateOf: (row: T) => Date | string, todayKey = todayInZone()) {
  const groups: { key: string; title: string; rows: T[] }[] = [];
  for (const row of rows) {
    const key = zonedDayKey(dateOf(row));
    const last = groups[groups.length - 1];
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, title: formatDayHeading(key, todayKey), rows: [row] });
  }
  return groups;
}
