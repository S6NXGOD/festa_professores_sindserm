import { zonedLocalToUtc } from "@/lib/datetime";

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

export function isKitDeadlinePassed(config: KitDeadlineConfig | null, now = new Date()): boolean {
  const deadline = config ? kitDeadlineAt(config) : null;
  return deadline !== null && now.getTime() >= deadline.getTime();
}
