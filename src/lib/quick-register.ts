/**
 * Endereço do cadastro rápido da portaria, já preenchido com o que foi digitado
 * na busca: CPF completo vai para o CPF; nome (só letras) vai para o nome;
 * código de voucher ou pedaço de número não preenche nada.
 */
export function quickRegisterHref(base: string, query: string): string {
  const text = query.trim();
  const digits = text.replace(/\D/g, "");
  if (digits.length === 11 && /^[\d.\-\s]+$/.test(text)) return `${base}?cpf=${digits}`;
  if (/^[\p{L}\s'.-]+$/u.test(text) && text.replace(/[^\p{L}]/gu, "").length >= 2) return `${base}?nome=${encodeURIComponent(text)}`;
  return base;
}
