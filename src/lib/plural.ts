/**
 * Número + palavra no singular ou no plural: "1 inscrição", "2 inscrições".
 * Evita o "inscrição(ões)" de sistema antigo.
 */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? one : many}`;
}
