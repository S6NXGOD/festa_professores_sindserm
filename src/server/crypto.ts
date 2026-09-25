import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/** Prefixo do conteúdo do QR Code. O QR nunca contém dados pessoais. */
export const QR_PREFIX = "SFP1:";
const TOKEN_BYTES = 20;
/** 32 caracteres Crockford Base32 (160 bits). */
const TOKEN_REGEX = /^[0-9A-HJKMNP-TV-Z]{32}$/;
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/**
 * Token aleatório criptograficamente seguro (160 bits). Usa Base32 maiúsculo
 * para que o QR fique no modo alfanumérico (versão 2, 25×25 módulos): mais
 * simples e rápido de ler pela câmera do que um QR em modo byte.
 */
export function generateToken(): string {
  return base32(randomBytes(TOKEN_BYTES));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function qrPayloadFor(token: string): string {
  return `${QR_PREFIX}${token}`;
}

/** Extrai o token de um conteúdo lido pelo scanner. Retorna null se não for nosso formato. */
export function parseQrPayload(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  const token = value.startsWith(QR_PREFIX) ? value.slice(QR_PREFIX.length) : value;
  return TOKEN_REGEX.test(token) ? token : null;
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_REGEX.test(token);
}

// ---------------------------------------------------------------------------
// Código curto do voucher (Crockford Base32, sem I, L, O, U)
// ---------------------------------------------------------------------------

const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateVoucherCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Normaliza o código digitado: remove separadores e corrige letras ambíguas. */
export function normalizeVoucherCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

export function formatVoucherCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

// ---------------------------------------------------------------------------
// Cifra dos tokens em repouso (AES-256-GCM)
// ---------------------------------------------------------------------------

function encryptionKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY não configurada.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY deve ter 32 bytes em base64.");
  return key;
}

export function encryptSecret(plaintext: string, associatedData: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, associatedData: string): string {
  const [version, iv, ciphertext, tag] = payload.split(".");
  if (version !== "v1" || !iv || !ciphertext || !tag) throw new Error("Formato de segredo inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

const BYTES_VERSION = 1;

/**
 * Cifra arquivos (ex.: documentos da ficha) com AES-256-GCM. Formato:
 * versão (1 byte) + IV (12) + tag (16) + conteúdo cifrado.
 */
export function encryptBytes(plaintext: Buffer, associatedData: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([BYTES_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBytes(payload: Buffer, associatedData: string): Buffer {
  if (payload.length < 29 || payload[0] !== BYTES_VERSION) throw new Error("Formato de arquivo cifrado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), payload.subarray(1, 13));
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(payload.subarray(13, 29));
  return Buffer.concat([decipher.update(payload.subarray(29)), decipher.final()]);
}

/** HMAC para identificadores transitórios (ex.: IP no rate limit), nunca guardados em claro. */
export function keyedHash(value: string, purpose: string): string {
  return createHmac("sha256", encryptionKey()).update(`${purpose}:${value}`).digest("base64url").slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(sha256Hex(a), "hex");
  const right = Buffer.from(sha256Hex(b), "hex");
  return timingSafeEqual(left, right);
}
