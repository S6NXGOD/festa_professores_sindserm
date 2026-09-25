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

export function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
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
