/** Normaliza espaços e composição Unicode de nomes e textos livres. */
export function normalizeSpaces(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Versão sem acentos e minúscula, usada para busca por nome. */
export function toSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Escapa curingas do LIKE para buscas com texto do usuário. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Partículas que ficam minúsculas no meio do nome ("Maria das Dores"). */
const NAME_PARTICLES = new Set(["da", "das", "de", "do", "dos", "e"]);

/**
 * Nome digitado todo em MAIÚSCULAS (ou todo em minúsculas) vira "Nome Próprio"
 * para aparecer no meio de frases ("o seu e o de Gabriel"). Nome que já veio
 * com maiúsculas e minúsculas é respeitado como está.
 */
export function properName(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (!letters) return text;
  const shouting = letters === letters.toLocaleUpperCase("pt-BR");
  const whispering = letters === letters.toLocaleLowerCase("pt-BR");
  if (!shouting && !whispering) return text;
  return text
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, index) =>
      index > 0 && NAME_PARTICLES.has(word)
        ? word
        : word
            .split("-")
            // Maiúscula no início e depois de apóstrofo ("d'ávila" → "D'Ávila").
            .map((part) => part.replace(/(^|')(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase("pt-BR")))
            .join("-"),
    )
    .join(" ");
}

/** Primeiro nome, já em "Nome Próprio" ("  GABRIEL ARCANJO" → "Gabriel"). */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return properName(first || fullName);
}

export function initials(fullName: string): string {
  const parts = fullName.split(" ").filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "quinta-feira, 15 de outubro" -> "Quinta-feira, 15 de outubro". */
export function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1) : value;
}

/**
 * "Festa das Professoras e Professores – SINDSERMTHE 2026" vira título
 * ("Festa das Professoras e Professores") e chamada ("SINDSERMTHE 2026"), para
 * cabeçalhos e artes. Separador: travessão ou hífen com espaços dos dois lados.
 */
export function splitEventName(name: string): { title: string; tagline: string | null } {
  const match = /^(.+?)\s+[-–—]\s+(.+)$/.exec(name.trim());
  if (!match?.[1] || !match[2]) return { title: name.trim(), tagline: null };
  return { title: match[1].trim(), tagline: match[2].trim() };
}
