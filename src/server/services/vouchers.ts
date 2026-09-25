import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Executor, Tx } from "@/server/db";
import { person, voucher } from "@/server/db/schema";
import {
  decryptSecret,
  encryptSecret,
  generateToken,
  generateVoucherCode,
  isWellFormedToken,
  normalizeVoucherCode,
  sha256Hex,
} from "@/server/crypto";
import { type Actor, actorUserId, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { DomainError } from "./errors";
import { withTx } from "./tx";

function aadFor(voucherId: string) {
  return `voucher:${voucherId}`;
}

async function uniqueCode(tx: Executor): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateVoucherCode();
    const existing = await tx.select({ id: voucher.id }).from(voucher).where(eq(voucher.code, code)).limit(1);
    if (existing.length === 0) return code;
  }
  throw new Error("Não foi possível gerar um código de voucher único.");
}

/** Emite um novo voucher (QR) para a pessoa. Retorna o token em claro apenas agora. */
export async function issueVoucher(tx: Tx, personId: string, issuedByUserId: string | null) {
  const id = randomUUID();
  const token = generateToken();
  const code = await uniqueCode(tx);
  await tx.insert(voucher).values({
    id,
    personId,
    code,
    tokenHash: sha256Hex(token),
    tokenCiphertext: encryptSecret(token, aadFor(id)),
    issuedByUserId,
  });
  return { voucherId: id, code, token };
}

/** Garante que a pessoa tenha um voucher ativo (reaproveita o existente). */
export async function ensureActiveVoucher(tx: Tx, personId: string, issuedByUserId: string | null) {
  const [active] = await tx
    .select({ id: voucher.id, code: voucher.code })
    .from(voucher)
    .where(and(eq(voucher.personId, personId), isNull(voucher.revokedAt)))
    .limit(1);
  if (active) return { voucherId: active.id, code: active.code, created: false as const };
  const issued = await issueVoucher(tx, personId, issuedByUserId);
  return { voucherId: issued.voucherId, code: issued.code, created: true as const };
}

export async function revokeActiveVoucher(tx: Tx, personId: string, byUserId: string | null, reason: string) {
  await tx
    .update(voucher)
    .set({ revokedAt: new Date(), revokedByUserId: byUserId, revokeReason: reason })
    .where(and(eq(voucher.personId, personId), isNull(voucher.revokedAt)));
}

/** Recupera o token em claro de um voucher (para renderizar o QR). */
export function revealVoucherToken(row: { id: string; tokenCiphertext: string }): string {
  return decryptSecret(row.tokenCiphertext, aadFor(row.id));
}

export interface VoucherLookup {
  voucherId: string;
  personId: string;
  code: string;
  revokedAt: Date | null;
  tokenCiphertext: string;
}

export async function findVoucherByToken(ex: Executor, token: string): Promise<VoucherLookup | null> {
  if (!isWellFormedToken(token)) return null;
  const [row] = await ex
    .select({
      voucherId: voucher.id,
      personId: voucher.personId,
      code: voucher.code,
      revokedAt: voucher.revokedAt,
      tokenCiphertext: voucher.tokenCiphertext,
    })
    .from(voucher)
    .where(eq(voucher.tokenHash, sha256Hex(token)))
    .limit(1);
  return row ?? null;
}

export async function findVoucherByCode(ex: Executor, rawCode: string): Promise<VoucherLookup | null> {
  const code = normalizeVoucherCode(rawCode);
  if (code.length !== 8) return null;
  const [row] = await ex
    .select({
      voucherId: voucher.id,
      personId: voucher.personId,
      code: voucher.code,
      revokedAt: voucher.revokedAt,
      tokenCiphertext: voucher.tokenCiphertext,
    })
    .from(voucher)
    .where(eq(voucher.code, code))
    .limit(1);
  return row ?? null;
}

export async function getActiveVoucherToken(ex: Executor, personId: string): Promise<{ token: string; code: string } | null> {
  const [row] = await ex
    .select({ id: voucher.id, code: voucher.code, tokenCiphertext: voucher.tokenCiphertext })
    .from(voucher)
    .where(and(eq(voucher.personId, personId), isNull(voucher.revokedAt)))
    .limit(1);
  if (!row) return null;
  return { token: revealVoucherToken(row), code: row.code };
}

/** Cancela o QR atual e emite um novo (ex.: voucher extraviado ou compartilhado indevidamente). */
export async function reissueVoucher(actor: Actor, personId: string) {
  assertPermission(actor, "reissueVoucher");
  return withTx(async (tx) => {
    const [target] = await tx.select({ id: person.id, fullName: person.fullName }).from(person).where(eq(person.id, personId)).for("update");
    if (!target) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
    await revokeActiveVoucher(tx, personId, actorUserId(actor), "Reemitido pela equipe");
    const issued = await issueVoucher(tx, personId, actorUserId(actor));
    await writeAudit(tx, actor, {
      action: "VOUCHER_REISSUED",
      entityType: "person",
      entityId: personId,
      summary: `Novo voucher emitido para ${target.fullName}; o QR anterior foi cancelado.`,
      after: { code: issued.code },
    });
    return issued;
  });
}
