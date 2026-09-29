import { formatPhone } from "@/lib/phone";
import { firstName as first } from "@/lib/text";
import type { AffiliationStatus } from "./types";

/*
 * Mensagens prontas para a equipe falar com quem se inscreveu pelo WhatsApp
 * (conferência, ficha, filiação não confirmada). A pessoa da equipe revisa no
 * WhatsApp antes de enviar.
 */

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

/** Última linha da mensagem com os vouchers de cortesia: o que acontece na entrada, com ou sem kit de consumação. */
export function courtesyClosingLine(people: { fullName: string; withKit: boolean }[]) {
  const withKit = people.filter((person) => person.withKit);
  if (people.length === 1) {
    return withKit.length
      ? "Na entrada, é só mostrar o QR Code. O seu kit de consumação sai junto com a entrada."
      : "Na entrada, é só mostrar o QR Code (entrada sem kit de consumação).";
  }
  if (withKit.length === people.length) {
    return "Na entrada, cada pessoa mostra o próprio QR Code. O kit de consumação de cada um sai junto com a entrada.";
  }
  if (withKit.length === 0) return "Na entrada, cada pessoa mostra o próprio QR Code (entrada sem kit de consumação).";
  const names = withKit.map((person) => first(person.fullName));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return `Na entrada, cada pessoa mostra o próprio QR Code. Kit de consumação: só ${list}, junto com a entrada.`;
}

/**
 * A equipe manda a ficha para a pessoa assinar pelo gov.br, sem esperar a festa.
 * `formsPhone`: o WhatsApp da secretaria que recebe as fichas assinadas.
 */
export function govbrSigningMessage(input: { fullName: string; eventName: string; link: string; formsPhone: string | null }): string {
  const back = input.formsPhone
    ? `mande o PDF assinado para o WhatsApp da secretaria do SINDSERM: ${formatPhone(input.formsPhone)}`
    : "responda esta conversa com o PDF assinado";
  return [
    `Olá, ${first(input.fullName)}! Aqui é da organização da ${input.eventName}.`,
    "A sua ficha de filiação ao SINDSERM está pronta. Não precisa esperar a festa: dá para assinar agora, pelo celular, com a conta gov.br.",
    `Passo a passo e a ficha em PDF: ${input.link}`,
    `Depois de assinar, ${back}. Assim que conferirmos, a sua filiação fica efetivada e o seu voucher já vale na entrada.`,
  ].join("\n\n");
}

/** A pessoa devolve a ficha assinada (botão da página de assinatura): diz de quem é, para a secretaria achar rápido. */
export function signedFormReturnMessage(input: { fullName: string; reference: string }): string {
  return `Olá! Segue a minha ficha de filiação ao SINDSERM assinada pelo gov.br (anexo o PDF). Nome: ${input.fullName} · Ficha ${input.reference}.`;
}

/** Filiação efetivada pela ficha assinada no gov.br: a equipe avisa a pessoa. */
export function govbrApprovedMessage(input: { fullName: string; eventName: string; vouchersUrl: string | null }): string {
  const voucher = input.vouchersUrl
    ? `Os seus vouchers: ${input.vouchersUrl}`
    : "O seu voucher é o mesmo de antes (se perdeu o link, recupere no site da festa, em Meus vouchers).";
  return `Olá, ${first(input.fullName)}! Recebemos a sua ficha assinada pelo gov.br: a sua filiação ao SINDSERM está efetivada e o seu voucher já vale na entrada da ${input.eventName}. ${voucher} Até a festa!`;
}
