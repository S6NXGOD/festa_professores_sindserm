import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { eventStartLabel, hasEventStarted, kitDeadlineAt } from "@/domain/kit-deadline";
import { DEFAULT_EVENT_NAME } from "@/domain/labels";
import { formatClock, formatPlainDate, formatPlainDateLong, formatTime, zonedLocalToUtc } from "@/lib/datetime";
import { mapsEmbedUrl, mapsOpenUrl } from "@/lib/maps";
import { db } from "@/server/db";
import { getEventConfig, registrationWindow } from "@/server/services/settings";
import { countUsers } from "@/server/services/users";
import { getSiteIconInfo } from "@/server/services/site-icon";
import { getEventPhotoMeta } from "@/server/services/venue";

export const APP_NAME = DEFAULT_EVENT_NAME;

/** Configuração do evento para a requisição atual (sempre dinâmica). */
export const getConfig = cache(async () => {
  await connection();
  return getEventConfig(db);
});

export const hasUsers = cache(async () => {
  await connection();
  return (await countUsers(db)) > 0;
});

export const getRegistrationWindow = cache(async () => registrationWindow(await getConfig()));

/** Ícone do site (versão para a URL e se foi trocado em Configurações). */
export const getSiteIcon = cache(async () => {
  await connection();
  return getSiteIconInfo(db);
});

/** Local da festa (tudo opcional). */
export interface VenueInfo {
  name: string | null;
  address: string | null;
  description: string | null;
  /** "Abrir no Google Maps" (no celular abre o aplicativo). */
  openUrl: string | null;
  /** Mapa embutido (carregado só quando a pessoa pede). */
  embedUrl: string | null;
  photo: { url: string; width: number; height: number } | null;
}

export interface EventInfo {
  name: string;
  description: string | null;
  dateLabel: string;
  dateLongLabel: string;
  timeLabel: string;
  /** Início da festa (para contagem regressiva). */
  startsAt: Date | null;
  /** "16/10/2026, às 19h" */
  startLabel: string;
  /** A festa já começou (agora, nesta requisição)? */
  started: boolean;
  kitDeadline: { at: Date; label: string } | null;
  venue: VenueInfo | null;
  /** WhatsApp da organização para dúvidas (somente dígitos). */
  helpWhatsapp: string | null;
}

/** Informações do evento usadas na página inicial, vouchers e portaria. */
export const getEventInfo = cache(async (): Promise<EventInfo | null> => {
  const config = await getConfig();
  if (!config) return null;
  const deadline = kitDeadlineAt(config);
  const photo = await getEventPhotoMeta(db);
  const location = { name: config.venueName, address: config.venueAddress, mapsUrl: config.venueMapsUrl };
  const hasVenue = Boolean(config.venueName || config.venueAddress || config.venueDescription || config.venueMapsUrl || photo);
  return {
    name: config.name,
    description: config.description,
    dateLabel: formatPlainDate(config.eventDate),
    dateLongLabel: formatPlainDateLong(config.eventDate),
    timeLabel: config.endTime
      ? `${formatClock(config.startTime)} às ${formatClock(config.endTime)}`
      : formatClock(config.startTime),
    startsAt: zonedLocalToUtc(`${config.eventDate}T${config.startTime.slice(0, 5)}`),
    startLabel: eventStartLabel(config),
    started: hasEventStarted(config),
    kitDeadline: deadline ? { at: deadline, label: formatTime(deadline) } : null,
    venue: hasVenue
      ? {
          name: config.venueName,
          address: config.venueAddress,
          description: config.venueDescription,
          openUrl: mapsOpenUrl(location),
          embedUrl: mapsEmbedUrl(location),
          photo: photo
            ? { url: `/local/foto?v=${photo.updatedAt.getTime()}`, width: photo.width, height: photo.height }
            : null,
        }
      : null,
    helpWhatsapp: config.helpWhatsapp,
  };
});
