import "server-only";
import { keyedHash, safeEqual } from "@/server/crypto";

/*
 * Link para assinar a ficha pelo gov.br ("/assinar/<token>"). O token leva a
 * ficha, a validade e uma assinatura (HMAC com a chave do sistema): não fica
 * guardado no banco, não dá para inventar e para de valer sozinho.
 */

const PURPOSE = "ficha-gov-br";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Validade do link (a pessoa pode assinar com calma até a festa). */
export const SIGNING_LINK_DAYS = 60;

export function signingToken(formId: string, now = new Date()): string {
  const expires = Math.floor(now.getTime() / 1000) + SIGNING_LINK_DAYS * 86_400;
  const payload = `${formId}.${expires.toString(36)}`;
  return `${payload}.${keyedHash(payload, PURPOSE)}`;
}

/** A ficha do link, ou null se o link foi alterado, é de outro sistema ou venceu. */
export function readSigningToken(token: string, now = new Date()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [formId, expires36, signature] = parts as [string, string, string];
  if (!UUID.test(formId) || !/^[0-9a-z]{1,10}$/.test(expires36)) return null;
  if (!safeEqual(signature, keyedHash(`${formId}.${expires36}`, PURPOSE))) return null;
  if (Number.parseInt(expires36, 36) * 1000 < now.getTime()) return null;
  return formId.toLowerCase();
}

export function signingPath(formId: string, now = new Date()): string {
  return `/assinar/${signingToken(formId, now)}`;
}
