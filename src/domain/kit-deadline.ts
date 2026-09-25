import { formatClock, formatPlainDate, zonedLocalToUtc } from "@/lib/datetime";

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export interface KitDeadlineConfig {
  eventDate: string;
  startTime: string;
  kitDeadlineTime: string | null;
}

/**
 * Instante limite para retirar kits: dia da festa + horário limite, no fuso do
 * evento. Um horário anterior ao início da festa vale para a madrugada seguinte
 * (ex.: festa às 20h com limite 1h = 1h do dia seguinte). Nulo = sem limite.
 */
export function kitDeadlineAt(config: KitDeadlineConfig): Date | null {
  if (!config.kitDeadlineTime) return null;
  const crossesMidnight = toMinutes(config.kitDeadlineTime) < toMinutes(config.startTime);
  const day = crossesMidnight ? addDays(config.eventDate, 1) : config.eventDate;
  return zonedLocalToUtc(`${day}T${config.kitDeadlineTime.slice(0, 5)}`);
}

/** Início da festa: dia + horário de início, no fuso do evento. */
export function eventStartAt(config: { eventDate: string; startTime: string }): Date | null {
  return zonedLocalToUtc(`${config.eventDate}T${config.startTime.slice(0, 5)}`);
}

/** "16/10/2026, às 19h" — para avisos da portaria. */
export function eventStartLabel(config: { eventDate: string; startTime: string }): string {
  return `${formatPlainDate(config.eventDate)}, às ${formatClock(config.startTime)}`;
}

/**
 * A festa já começou? Antes disso, a portaria só registra entrada com uma
 * confirmação a mais. Sem festa configurada, não trava nada.
 */
export function hasEventStarted(config: { eventDate: string; startTime: string } | null, now = new Date()): boolean {
  const start = config ? eventStartAt(config) : null;
  return start === null || now.getTime() >= start.getTime();
}

export function isKitDeadlinePassed(config: KitDeadlineConfig | null, now = new Date()): boolean {
  const deadline = config ? kitDeadlineAt(config) : null;
  return deadline !== null && now.getTime() >= deadline.getTime();
}
