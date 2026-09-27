/**
 * Normaliza telefone brasileiro para DDD + número (10 ou 11 dígitos).
 * Remove o prefixo 55 quando informado.
 */
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits;
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  if (!/^[1-9]{2}\d{8,9}$/.test(digits)) return false;
  // Celulares com 11 dígitos começam com 9 após o DDD.
  if (digits.length === 11 && digits[2] !== "9") return false;
  return true;
}

/**
 * Mesmo número? Aceita o celular com ou sem o 9 depois do DDD (muita gente
 * cadastrou de um jeito e digita do outro).
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizePhone(a ?? "");
  const y = normalizePhone(b ?? "");
  if (!x || !y) return false;
  const core = (digits: string) => (digits.length === 11 && digits[2] === "9" ? digits.slice(0, 2) + digits.slice(3) : digits);
  return core(x) === core(y);
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const d = normalizePhone(value);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value;
}

/** Conversa no WhatsApp (wa.me) com a mensagem já escrita. */
export function whatsappLink(phone: string, message?: string): string {
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/55${normalizePhone(phone)}${text}`;
}

export function maskPhoneInput(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
