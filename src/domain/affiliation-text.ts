import { UNION } from "./union";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

/** Mês seguinte a uma data "YYYY-MM-DD", no formato "YYYY-MM" (início sugerido do desconto). */
export function nextMonthValue(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const year = m === 12 ? y! + 1 : y!;
  const month = m === 12 ? 1 : m! + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "2026-11" -> { month: "novembro", year: "2026" } */
export function splitContributionMonth(value: string | null | undefined): { month: string; year: string } {
  const [year, month] = (value ?? "").split("-");
  return { month: monthName(Number(month)), year: year ?? "" };
}

/**
 * Texto da autorização de desconto, igual ao da ficha de filiação oficial,
 * já com o mês e o ano de início. Uma cópia do texto aceito fica gravada com a
 * ficha. A formalização continua sendo a assinatura na ficha impressa.
 */
export function authorizationText(contributionStartMonth?: string | null): string {
  const { month, year } = splitContributionMonth(contributionStartMonth);
  const period = month && year ? `a partir do mês de ${month} do ano de ${year}` : "a partir do mês e ano indicados na ficha";
  return (
    `Autorizo que seja descontado, em favor do ${UNION.shortName}, o valor correspondente a ` +
    `1% (um por cento) do meu salário base, ${period}.`
  );
}

export const AUTHORIZATION_ACCEPT_LABEL =
  "Li e concordo com a autorização de desconto de 1% do salário base em favor do SINDSERM. Vou assinar a ficha impressa na recepção.";

export const STAFF_AUTHORIZATION_ACCEPT_LABEL =
  "A pessoa leu e aceita a autorização de desconto de 1% do salário base em favor do SINDSERM.";
