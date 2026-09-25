/** Remove tudo que não é dígito. */
export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

/** Valida CPF pelos dígitos verificadores. Aceita com ou sem máscara. */
export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digits = Array.from(cpf, Number);
  const checkDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += digits[i]! * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}

/** 12345678909 -> 123.456.789-09 */
export function formatCpf(value: string | null | undefined): string {
  if (!value) return "";
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) return value;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** Máscara para telas onde o CPF completo não é necessário: ***.456.789-** */
export function maskCpf(value: string | null | undefined): string {
  if (!value) return "";
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) return "***.***.***-**";
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

/** CPF para exibição: completo ou mascarado conforme o perfil; convidado sem CPF aparece como tal. */
export function displayCpf(value: string | null | undefined, full: boolean): string {
  if (!value) return "Sem CPF";
  return full ? formatCpf(value) : maskCpf(value);
}

/** Formata progressivamente enquanto o usuário digita. */
export function maskCpfInput(value: string): string {
  const d = normalizeCpf(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
