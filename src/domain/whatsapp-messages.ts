import type { AffiliationStatus } from "./types";

/*
 * Mensagens prontas para a equipe falar com quem se inscreveu pelo WhatsApp
 * (conferência, ficha, filiação não confirmada). A pessoa da equipe revisa no
 * WhatsApp antes de enviar.
 */

function first(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function registrationWhatsappMessage(input: { fullName: string; status: AffiliationStatus; eventName: string }): string {
  const hello = `Olá, ${first(input.fullName)}! Aqui é da organização da ${input.eventName}.`;
  switch (input.status) {
    case "PENDING":
      return `${hello} Recebemos a sua inscrição e estamos conferindo a sua filiação ao SINDSERM. Pode nos ajudar com uma informação?`;
    case "AWAITING_SIGNATURE":
      return `${hello} Recebemos a sua ficha de filiação: no dia da festa, é só assinar na recepção (leve um documento com foto).`;
    case "REJECTED":
      return `${hello} Não conseguimos confirmar a sua filiação ao SINDSERM. Se você for filiado(a), leve o último contracheque no dia da festa que a gente resolve na hora.`;
    case "CONFIRMED":
    case "JOINED_AT_EVENT":
      return `${hello} A sua inscrição está confirmada. Até a festa!`;
  }
}

/** Para colaboradores do SINDSERM e convidados (sem conferência de filiação). */
export function personWhatsappMessage(input: { fullName: string; eventName: string }): string {
  return `Olá, ${first(input.fullName)}! Aqui é da organização da ${input.eventName}.`;
}
