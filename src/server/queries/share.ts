import "server-only";
import { formatShortDateTime } from "@/lib/datetime";
import { capitalizeFirst } from "@/lib/text";
import type { RegistrationWindow } from "@/server/services/settings";
import type { EventInfo } from "./config";

/*
 * Textos de divulgação montados com os dados da festa (nada fixo no código):
 * a prévia do link no WhatsApp e a mensagem pronta do painel.
 */

/** "Inscrições até 16/10 às 18:00" / "em breve" / "encerradas". */
export function registrationLine(window: RegistrationWindow): string {
  if (window.state === "OPEN") return `Inscrições até ${formatShortDateTime(window.closesAt)}`;
  if (window.state === "NOT_OPEN") return `Inscrições a partir de ${formatShortDateTime(window.opensAt)}`;
  if (window.state === "CLOSED") return "Inscrições encerradas";
  return "Inscrições em breve";
}

/** Uma linha para a prévia do link: quando, onde e o que ganha. */
export function shareSummary(event: EventInfo, window: RegistrationWindow): string {
  const where = event.venue?.name ? ` · ${event.venue.name}` : "";
  return (
    `${capitalizeFirst(event.dateLongLabel)} · ${event.timeLabel}${where}. ${registrationLine(window)}. ` +
    "Kit de consumação para professoras e professores filiados(as), com 1 convidado."
  );
}

/**
 * Mensagem de divulgação (formatação do WhatsApp: *negrito*, _itálico_). A
 * organização pode trocar pelo texto dela no painel; esta é a automática.
 */
export function defaultShareMessage(event: EventInfo, window: RegistrationWindow, url: string): string {
  const lines = [
    `*${event.name}*`,
    "_A luta não sai de moda — nos embalos de sexta à noite!_",
    "",
    `📅 ${capitalizeFirst(event.dateLongLabel)}`,
    `🕖 ${event.timeLabel}`,
  ];
  if (event.venue?.name || event.venue?.address) {
    lines.push(`📍 ${[event.venue.name, event.venue.address].filter(Boolean).join(" — ")}`);
  }
  lines.push(
    "",
    "Professoras e professores filiados(as) ao SINDSERM ganham *kit de consumação* e podem levar *1 convidado(a)* (com kit).",
    "Ainda não é filiado(a)? Dá para preencher a ficha de filiação na própria inscrição.",
    "",
    `✅ ${registrationLine(window)}:`,
    url,
  );
  return lines.join("\n");
}
