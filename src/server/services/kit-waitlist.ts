import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import type { Executor, Tx } from "@/server/db";
import { eventConfig, kitStock, registration } from "@/server/db/schema";
import type { KitSupply } from "@/domain/kit-supply";
import { stockPoolFor } from "@/domain/rules";
import type { GroupKitType, StockMode, StockPool } from "@/domain/types";
import { type Actor, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { withTx } from "./tx";

/*
 * Fila do kit. Os kits de professoras, professores e convidados são guardados
 * por ordem de inscrição: quem se inscreve quando o estoque já está todo com os
 * inscritos entra na fila (o kit não sai na portaria). Vagou kit — inscrição
 * recusada, estoque aumentado —, a fila anda, por ordem de chegada nela.
 *
 * A conta de "garantidos" é a mesma da previsão do estoque: professoras e
 * professores inscritos (inclusive quem aguarda conferência ou assinatura) e os
 * convidados deles, menos quem está na fila. O estoque dos colaboradores fica
 * de fora: a lista interna é controlada pela própria organização.
 */

const EXPECTED_STATUSES: readonly string[] = ["PENDING", "AWAITING_SIGNATURE", "CONFIRMED", "JOINED_AT_EVENT"];
const EXPECTED = sql`('PENDING', 'AWAITING_SIGNATURE', 'CONFIRMED', 'JOINED_AT_EVENT')`;

/** Estoques dos kits de inscritos (o dos colaboradores não tem fila). */
type GroupPool = Exclude<StockPool, "EMPLOYEE">;

function groupPools(mode: StockMode): GroupPool[] {
  return mode === "SPLIT" ? ["MEMBER", "GUEST"] : ["ALL"];
}

/** Modo do estoque (único ou separado); nulo antes da configuração da festa. */
async function getEventConfig(ex: Executor): Promise<{ stockMode: StockMode } | null> {
  const [row] = await ex.select({ stockMode: eventConfig.stockMode }).from(eventConfig).where(eq(eventConfig.id, 1)).limit(1);
  return row ?? null;
}

/** Toda decisão de kit (dar, pôr na fila, tirar da fila) passa por aqui, uma de cada vez. */
async function lockKitAllocation(tx: Tx) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('kit_allocation'))`);
}

export interface PoolBalance {
  pool: GroupPool;
  total: number;
  delivered: number;
  /** Kits garantidos para os inscritos (inclui os já entregues e quem aguarda conferência). */
  committed: number;
  /** Na fila, esperando vagar (só quem ainda pode receber). */
  waitlist: number;
  /** Kits sem dono agora: o estoque menos os garantidos (nunca mais do que há fisicamente). */
  free: number;
}

async function slotCounts(ex: Executor, excludeRegistrationId: string | null) {
  const exclude = excludeRegistrationId ? sql`AND r.id <> ${excludeRegistrationId}` : sql``;
  const result = await ex.execute<Record<string, number>>(sql`
    SELECT
      (SELECT count(*) FROM registration r
        WHERE r.status IN ${EXPECTED} AND r.is_teacher AND r.member_kit_waitlisted_at IS NULL ${exclude})::int AS member_committed,
      (SELECT count(*) FROM registration r
        WHERE r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NULL ${exclude}
          AND (EXISTS (SELECT 1 FROM guest_link gl WHERE gl.registration_id = r.id AND gl.status = 'ACTIVE')
               OR EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
      )::int AS guest_committed,
      (SELECT count(*) FROM registration r
        WHERE r.status IN ${EXPECTED} AND r.is_teacher AND r.member_kit_waitlisted_at IS NOT NULL ${exclude})::int AS member_waitlist,
      (SELECT count(*) FROM registration r
        WHERE r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NOT NULL ${exclude}
          AND EXISTS (SELECT 1 FROM guest_link gl WHERE gl.registration_id = r.id AND gl.status = 'ACTIVE'))::int AS guest_waitlist,
      -- Kits da lista interna (colaboradores com kit, convidados deles e cortesias com kit): no estoque único, tiram do mesmo total.
      ((SELECT count(*) FROM employee WHERE removed_at IS NULL AND with_kit)
       + (SELECT count(*) FROM employee e
           WHERE e.removed_at IS NULL
             AND (EXISTS (SELECT 1 FROM guest_link gl WHERE gl.employee_id = e.id AND gl.status = 'ACTIVE')
                  OR EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.employee_id = e.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))))::int
        AS employee_committed
  `);
  const row = result.rows[0] ?? {};
  const n = (key: string) => Number(row[key] ?? 0);
  return {
    MEMBER: { committed: n("member_committed"), waitlist: n("member_waitlist") },
    GUEST: { committed: n("guest_committed"), waitlist: n("guest_waitlist") },
    EMPLOYEE: { committed: n("employee_committed"), waitlist: 0 },
  };
}

/** Saldo de cada estoque de kits de inscritos. `extra`: vagas a somar nos garantidos (ex.: a outra vaga da mesma inscrição). */
export async function loadKitBalances(
  ex: Executor,
  mode: StockMode,
  excludeRegistrationId: string | null = null,
  extra: Partial<Record<GroupKitType, number>> = {},
): Promise<PoolBalance[]> {
  const pools = groupPools(mode);
  const [counts, rows] = await Promise.all([
    slotCounts(ex, excludeRegistrationId),
    ex.select().from(kitStock).where(inArray(kitStock.pool, pools)),
  ]);
  const member = { committed: counts.MEMBER.committed + (extra.MEMBER ?? 0), waitlist: counts.MEMBER.waitlist };
  const guest = { committed: counts.GUEST.committed + (extra.GUEST ?? 0), waitlist: counts.GUEST.waitlist };
  // Estoque único para todos: os kits da lista interna também saem do geral (e nunca vão para a fila).
  const house = mode === "UNIFIED" ? [counts.EMPLOYEE] : [];
  return pools.map((pool) => {
    const row = rows.find((r) => r.pool === pool);
    const total = row?.total ?? 0;
    const delivered = row?.delivered ?? 0;
    const slots = pool === "ALL" ? [member, guest, ...house] : pool === "MEMBER" ? [member] : [guest];
    const committed = slots.reduce((sum, s) => sum + s.committed, 0);
    const waitlist = slots.reduce((sum, s) => sum + s.waitlist, 0);
    return { pool, total, delivered, committed, waitlist, free: Math.max(0, Math.min(total - committed, total - delivered)) };
  });
}

/**
 * Quantos kits uma inscrição nova ainda consegue garantir, por tipo (o
 * formulário avisa quando acabaram). Estoque zerado = sem controle (sem fila).
 */
export async function getKitSupply(ex: Executor): Promise<KitSupply | null> {
  const config = await getEventConfig(ex);
  if (!config) return null;
  const balances = await loadKitBalances(ex, config.stockMode);
  const balanceOf = (kitType: GroupKitType) => balances.find((b) => b.pool === stockPoolFor(config.stockMode, kitType));
  // Quem já está na fila tem a vez antes de quem chega agora.
  const open = (kitType: GroupKitType) => {
    const balance = balanceOf(kitType);
    return !balance || balance.total <= 0 ? null : Math.max(0, balance.free - balance.waitlist);
  };
  return {
    shared: config.stockMode !== "SPLIT",
    member: open("MEMBER"),
    guest: open("GUEST"),
    queue: { member: balanceOf("MEMBER")?.waitlist ?? 0, guest: balanceOf("GUEST")?.waitlist ?? 0 },
  };
}

export interface WaitingSlot {
  registrationId: string;
  kitType: GroupKitType;
  since: Date;
  memberPersonId: string;
  memberName: string;
  guestPersonId: string | null;
  guestName: string | null;
  status: string;
}

/** A fila, na ordem: quem entrou primeiro nela; na mesma inscrição, o kit do(a) professor(a) antes do convidado. */
export async function listKitWaitlist(ex: Executor): Promise<WaitingSlot[]> {
  const result = await ex.execute<{
    registration_id: string;
    kit_type: GroupKitType;
    since: Date | string;
    member_person_id: string;
    member_name: string;
    guest_person_id: string | null;
    guest_name: string | null;
    status: string;
  }>(sql`
    SELECT * FROM (
      SELECT r.id AS registration_id, 'MEMBER' AS kit_type, r.member_kit_waitlisted_at AS since, r.status::text AS status,
             p.id AS member_person_id, p.full_name AS member_name, NULL::uuid AS guest_person_id, NULL::text AS guest_name
        FROM registration r
        JOIN person p ON p.id = r.member_person_id
       WHERE r.status IN ${EXPECTED} AND r.is_teacher AND r.member_kit_waitlisted_at IS NOT NULL
      UNION ALL
      SELECT r.id, 'GUEST', r.guest_kit_waitlisted_at, r.status::text, p.id, p.full_name, gp.id, gp.full_name
        FROM registration r
        JOIN person p ON p.id = r.member_person_id
        JOIN guest_link gl ON gl.registration_id = r.id AND gl.status = 'ACTIVE'
        JOIN person gp ON gp.id = gl.guest_person_id
       WHERE r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NOT NULL
    ) fila
    ORDER BY since, registration_id, kit_type DESC
  `);
  return result.rows.map((row) => ({
    registrationId: row.registration_id,
    kitType: row.kit_type,
    since: new Date(row.since),
    memberPersonId: row.member_person_id,
    memberName: row.member_name,
    guestPersonId: row.guest_person_id,
    guestName: row.guest_name,
    status: row.status,
  }));
}

/** Posição de cada kit de uma inscrição na fila (nulo = não está na fila), contando no mesmo estoque. */
export async function kitWaitlistPositions(ex: Executor, registrationId: string): Promise<Record<GroupKitType, number | null>> {
  const config = await getEventConfig(ex);
  const positions: Record<GroupKitType, number | null> = { MEMBER: null, GUEST: null };
  if (!config) return positions;
  const queue = await listKitWaitlist(ex);
  const counters = new Map<StockPool, number>();
  for (const slot of queue) {
    const pool = stockPoolFor(config.stockMode, slot.kitType);
    const position = (counters.get(pool) ?? 0) + 1;
    counters.set(pool, position);
    if (slot.registrationId === registrationId) positions[slot.kitType] = position;
  }
  return positions;
}

/**
 * A fila anda com os kits sem dono de `free` (por estoque), na ordem. Quem
 * está sendo atendido agora (linha travada por outra operação) fica para a
 * próxima rodada. `skipRegistrationId`: a inscrição que está sendo decidida.
 */
async function moveQueue(
  tx: Tx,
  actor: Actor,
  mode: StockMode,
  free: Map<StockPool, number>,
  skipRegistrationId: string | null,
): Promise<WaitingSlot[]> {
  if (![...free.values()].some((value) => value > 0)) return [];
  const promoted: WaitingSlot[] = [];
  for (const slot of await listKitWaitlist(tx)) {
    if (slot.registrationId === skipRegistrationId) continue;
    const pool = stockPoolFor(mode, slot.kitType);
    if ((free.get(pool) ?? 0) <= 0) continue;
    const [row] = await tx
      .select({ id: registration.id })
      .from(registration)
      .where(eq(registration.id, slot.registrationId))
      .for("update", { skipLocked: true });
    if (!row) continue;
    await tx
      .update(registration)
      .set(slot.kitType === "MEMBER" ? { memberKitWaitlistedAt: null } : { guestKitWaitlistedAt: null })
      .where(eq(registration.id, slot.registrationId));
    free.set(pool, free.get(pool)! - 1);
    await writeAudit(tx, actor, {
      action: "KIT_WAITLIST_PROMOTED",
      entityType: "registration",
      entityId: slot.registrationId,
      summary:
        slot.kitType === "MEMBER"
          ? `Vagou kit: ${slot.memberName} saiu da fila e tem o kit garantido.`
          : `Vagou kit: o do convidado ${slot.guestName} (grupo de ${slot.memberName}) saiu da fila e está garantido.`,
      after: { kitType: slot.kitType, waitingSince: slot.since.toISOString(), pool },
    });
    promoted.push(slot);
  }
  return promoted;
}

/** Kits sem dono por estoque (só os estoques com quantidade cadastrada: sem quantidade, não há fila). */
function freeByPool(balances: PoolBalance[]): Map<StockPool, number> {
  return new Map(balances.filter((b) => b.total > 0).map((b) => [b.pool, b.free]));
}

/** Vagou kit (inscrição recusada, estoque aumentado...): a fila anda, por ordem. Devolve quem saiu dela. */
export async function promoteKitWaitlist(tx: Tx, actor: Actor): Promise<WaitingSlot[]> {
  const config = await getEventConfig(tx);
  if (!config) return [];
  await lockKitAllocation(tx);
  const balances = await loadKitBalances(tx, config.stockMode);
  return moveQueue(tx, actor, config.stockMode, freeByPool(balances), null);
}

export type SlotOutcome = "KIT" | "WAITLIST";

/**
 * Decide o kit de uma inscrição (nova, ou que voltou a valer): garantido, se
 * ainda houver kit sem dono; senão, fila. Antes, a fila anda (quem já esperava
 * tem a vez). `slots`: quais kits decidir agora — os outros da mesma inscrição
 * ficam como estão.
 */
export async function allocateKitSlots(
  tx: Tx,
  actor: Actor,
  registrationId: string,
  slots: { member: boolean; guest: boolean },
  now = new Date(),
): Promise<{ member: SlotOutcome | null; guest: SlotOutcome | null }> {
  const outcome: { member: SlotOutcome | null; guest: SlotOutcome | null } = { member: null, guest: null };
  if (!slots.member && !slots.guest) return outcome;
  const config = await getEventConfig(tx);
  if (config) await lockKitAllocation(tx);

  const found = await tx.execute<{
    status: string;
    is_teacher: boolean;
    member_since: Date | null;
    guest_since: Date | null;
    name: string;
    guest_name: string | null;
    guest_kit_out: boolean;
  }>(sql`
    SELECT r.status::text AS status, r.is_teacher, r.member_kit_waitlisted_at AS member_since, r.guest_kit_waitlisted_at AS guest_since,
           p.full_name AS name,
           (SELECT gp.full_name FROM guest_link gl JOIN person gp ON gp.id = gl.guest_person_id
             WHERE gl.registration_id = r.id AND gl.status = 'ACTIVE' LIMIT 1) AS guest_name,
           EXISTS (SELECT 1 FROM kit_delivery kd
                    WHERE kd.registration_id = r.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL) AS guest_kit_out
      FROM registration r
      JOIN person p ON p.id = r.member_person_id
     WHERE r.id = ${registrationId}
  `);
  const row = found.rows[0];
  if (!row) return outcome;
  const current = {
    status: row.status,
    isTeacher: row.is_teacher,
    memberSince: row.member_since ? new Date(row.member_since) : null,
    guestSince: row.guest_since ? new Date(row.guest_since) : null,
    name: row.name,
    guestName: row.guest_name,
    guestKitOut: row.guest_kit_out,
  };

  // Kits que esta inscrição ainda consegue garantir, por estoque (sem quantidade cadastrada: sem limite).
  const open = new Map<StockPool, number>();
  if (config) {
    // A conta não inclui as vagas que estão sendo decididas agora; a outra vaga desta inscrição, se garantida, conta.
    const expected = EXPECTED_STATUSES.includes(current.status) && current.isTeacher;
    const extra = {
      MEMBER: !slots.member && expected && !current.memberSince ? 1 : 0,
      GUEST: !slots.guest && expected && !current.guestSince && (current.guestName !== null || current.guestKitOut) ? 1 : 0,
    };
    const balances = await loadKitBalances(tx, config.stockMode, registrationId, extra);
    // Quem já esperava na fila tem a vez.
    const free = freeByPool(balances);
    const promoted = await moveQueue(tx, actor, config.stockMode, free, registrationId);
    for (const balance of balances) {
      if (balance.total <= 0) {
        open.set(balance.pool, Number.POSITIVE_INFINITY);
        continue;
      }
      // Quem continua na fila (atendido agora em outra operação) também passa na frente.
      const stillWaiting = balance.waitlist - promoted.filter((slot) => stockPoolFor(config.stockMode, slot.kitType) === balance.pool).length;
      open.set(balance.pool, Math.max(0, (free.get(balance.pool) ?? 0) - stillWaiting));
    }
  }
  // No estoque único, o kit do(a) professor(a) e o do convidado saem do mesmo saldo.
  const take = (kitType: GroupKitType): SlotOutcome => {
    if (!config) return "KIT";
    const pool = stockPoolFor(config.stockMode, kitType);
    const left = open.get(pool) ?? Number.POSITIVE_INFINITY;
    if (left < 1) return "WAITLIST";
    open.set(pool, left - 1);
    return "KIT";
  };
  if (slots.member) outcome.member = take("MEMBER");
  if (slots.guest) outcome.guest = take("GUEST");

  const update: { memberKitWaitlistedAt?: Date | null; guestKitWaitlistedAt?: Date | null } = {};
  // Quem já estava na fila mantém o lugar (a hora em que entrou nela).
  if (outcome.member) update.memberKitWaitlistedAt = outcome.member === "WAITLIST" ? (current.memberSince ?? now) : null;
  if (outcome.guest) update.guestKitWaitlistedAt = outcome.guest === "WAITLIST" ? (current.guestSince ?? now) : null;
  await tx.update(registration).set(update).where(eq(registration.id, registrationId));

  const waiting = [
    outcome.member === "WAITLIST" && !current.memberSince ? `o de ${current.name}` : null,
    outcome.guest === "WAITLIST" && !current.guestSince ? `o do convidado ${current.guestName ?? ""}`.trim() : null,
  ].filter(Boolean);
  if (waiting.length) {
    await writeAudit(tx, actor, {
      action: "KIT_WAITLISTED",
      entityType: "registration",
      entityId: registrationId,
      summary: `Kits esgotados: ${waiting.join(" e ")} ${waiting.length > 1 ? "entraram" : "entrou"} na fila do kit.`,
      after: { member: outcome.member, guest: outcome.guest },
    });
  }
  return outcome;
}

/** Sem convidado, a vaga do kit dele fica vazia (e sai da fila, se estava). */
export async function clearGuestKitWaitlist(tx: Tx, registrationId: string) {
  await tx.update(registration).set({ guestKitWaitlistedAt: null }).where(eq(registration.id, registrationId));
}

/** "Andar a fila agora" (Kits e estoque): para quem entrega kits. */
export async function advanceKitWaitlist(actor: Actor) {
  assertPermission(actor, "deliverKits");
  return withTx(async (tx) => (await promoteKitWaitlist(tx, actor)).length);
}
