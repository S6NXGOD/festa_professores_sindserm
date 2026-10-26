import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import type { Executor, Tx } from "@/server/db";
import { eventConfig, kitStock, registration } from "@/server/db/schema";
import { EDITION } from "@/domain/edition";
import { isKitDeadlinePassed, kitDeadlineAt } from "@/domain/kit-deadline";
import type { KitSupply } from "@/domain/kit-supply";
import { formatTime } from "@/lib/datetime";
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
/**
 * Kit dividido (ver `Edition.sharedKit`): o convidado de inscrito não tem kit
 * próprio, então não guarda kit, não entra na fila e não pega da gordura. Marcas
 * antigas no banco (de antes da mudança) ficam sem efeito.
 */
const GUEST_KITS = sql.raw(EDITION.sharedKit ? "false" : "true");

/** Estoques dos kits de inscritos (o dos colaboradores e a gordura não têm fila). */
type GroupPool = Exclude<StockPool, "EMPLOYEE" | "EXTRA">;

function groupPools(mode: StockMode): GroupPool[] {
  return mode === "SPLIT" ? ["MEMBER", "GUEST"] : ["ALL"];
}

/** Modo do estoque (único ou separado) e o horário dos kits guardados; nulo antes da configuração da festa. */
async function getEventConfig(ex: Executor) {
  const [row] = await ex
    .select({
      stockMode: eventConfig.stockMode,
      eventDate: eventConfig.eventDate,
      startTime: eventConfig.startTime,
      kitDeadlineTime: eventConfig.kitDeadlineTime,
      registrationClosesAt: eventConfig.registrationClosesAt,
    })
    .from(eventConfig)
    .where(eq(eventConfig.id, 1))
    .limit(1);
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
      -- Kits da gordura (inscrição na hora) não contam no oficial.
      (SELECT count(*) FROM registration r
        WHERE r.status IN ${EXPECTED} AND r.is_teacher AND r.member_kit_waitlisted_at IS NULL AND r.member_kit_extra_at IS NULL ${exclude})::int AS member_committed,
      (SELECT count(*) FROM registration r
        WHERE ${GUEST_KITS} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NULL AND r.guest_kit_extra_at IS NULL ${exclude}
          AND (EXISTS (SELECT 1 FROM guest_link gl WHERE gl.registration_id = r.id AND gl.status = 'ACTIVE')
               OR EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
      )::int AS guest_committed,
      (SELECT count(*) FROM registration r
        WHERE r.status IN ${EXPECTED} AND r.is_teacher AND r.member_kit_waitlisted_at IS NOT NULL ${exclude})::int AS member_waitlist,
      (SELECT count(*) FROM registration r
        WHERE ${GUEST_KITS} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NOT NULL ${exclude}
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

export interface ExtraBalance {
  total: number;
  delivered: number;
  /** Kits da gordura prometidos a quem se inscreveu na hora (inclui os já entregues). */
  committed: number;
  /** Kits da gordura ainda sem dono. */
  free: number;
}

/**
 * Saldo da gordura: o estoque separado do oficial para quem se inscreve na hora.
 * `extra`: vagas a somar nos prometidos (a outra vaga da mesma inscrição).
 */
export async function loadExtraBalance(
  ex: Executor,
  excludeRegistrationId: string | null = null,
  extra: Partial<Record<GroupKitType, number>> = {},
): Promise<ExtraBalance> {
  const exclude = excludeRegistrationId ? sql`AND r.id <> ${excludeRegistrationId}` : sql``;
  const [counts, rows] = await Promise.all([
    ex.execute<{ member: number; guest: number }>(sql`
      SELECT
        (SELECT count(*) FROM registration r
          WHERE r.status IN ${EXPECTED} AND r.is_teacher AND r.member_kit_extra_at IS NOT NULL ${exclude})::int AS member,
        (SELECT count(*) FROM registration r
          WHERE ${GUEST_KITS} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_extra_at IS NOT NULL ${exclude}
            AND (EXISTS (SELECT 1 FROM guest_link gl WHERE gl.registration_id = r.id AND gl.status = 'ACTIVE')
                 OR EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
        )::int AS guest
    `),
    ex.select().from(kitStock).where(eq(kitStock.pool, "EXTRA")),
  ]);
  const total = rows[0]?.total ?? 0;
  const delivered = rows[0]?.delivered ?? 0;
  const row = counts.rows[0];
  const committed = Number(row?.member ?? 0) + Number(row?.guest ?? 0) + (extra.MEMBER ?? 0) + (extra.GUEST ?? 0);
  return { total, delivered, committed, free: Math.max(0, Math.min(total - committed, total - delivered)) };
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
  const deadline = kitDeadlineAt(config);
  return {
    shared: config.stockMode !== "SPLIT",
    member: open("MEMBER"),
    guest: open("GUEST"),
    queue: { member: balanceOf("MEMBER")?.waitlist ?? 0, guest: balanceOf("GUEST")?.waitlist ?? 0 },
    reservedUntil: deadline ? { label: formatTime(deadline), passed: isKitDeadlinePassed(config) } : null,
  };
}

/**
 * Oferta de kits para o cadastro feito pela equipe. Depois que as inscrições
 * fecham, quem se inscreve na hora pega o kit da gordura (enquanto houver): o
 * formulário mostra o saldo dela em vez do oficial (sem fila).
 */
export async function getStaffKitSupply(ex: Executor, now = new Date()): Promise<KitSupply | null> {
  const [base, config] = await Promise.all([getKitSupply(ex), getEventConfig(ex)]);
  if (!base || !config || now < config.registrationClosesAt) return base;
  const extra = await loadExtraBalance(ex);
  if (extra.total <= 0 || extra.free <= 0) return base;
  return { ...base, shared: true, member: extra.free, guest: extra.free, queue: { member: 0, guest: 0 }, extra: { free: extra.free } };
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
       WHERE ${GUEST_KITS} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NOT NULL
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

/** EXTRA: inscrição na hora (as inscrições já fecharam), com o kit da gordura. */
export type SlotOutcome = "KIT" | "WAITLIST" | "EXTRA";

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
  requested: { member: boolean; guest: boolean },
  now = new Date(),
): Promise<{ member: SlotOutcome | null; guest: SlotOutcome | null }> {
  const outcome: { member: SlotOutcome | null; guest: SlotOutcome | null } = { member: null, guest: null };
  // Kit dividido: só existe o kit do(a) filiado(a), que é para os dois.
  const guestKits = !EDITION.sharedKit;
  const slots = { member: requested.member, guest: guestKits && requested.guest };
  if (!slots.member && !slots.guest) return outcome;
  const config = await getEventConfig(tx);
  if (config) await lockKitAllocation(tx);

  const found = await tx.execute<{
    status: string;
    is_teacher: boolean;
    member_since: Date | null;
    guest_since: Date | null;
    member_extra: Date | null;
    guest_extra: Date | null;
    name: string;
    guest_name: string | null;
    guest_kit_out: boolean;
  }>(sql`
    SELECT r.status::text AS status, r.is_teacher, r.member_kit_waitlisted_at AS member_since, r.guest_kit_waitlisted_at AS guest_since,
           r.member_kit_extra_at AS member_extra, r.guest_kit_extra_at AS guest_extra,
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
    memberExtra: row.member_extra ? new Date(row.member_extra) : null,
    guestExtra: row.guest_extra ? new Date(row.guest_extra) : null,
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
      MEMBER: !slots.member && expected && !current.memberSince && !current.memberExtra ? 1 : 0,
      GUEST:
        guestKits && !slots.guest && expected && !current.guestSince && !current.guestExtra && (current.guestName !== null || current.guestKitOut) ? 1 : 0,
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
  // Inscrição na hora (as inscrições já fecharam): o kit sai da gordura, enquanto houver; depois, a regra do oficial.
  let extraOpen = 0;
  if (config && now >= config.registrationClosesAt) {
    const expected = EXPECTED_STATUSES.includes(current.status) && current.isTeacher;
    const balance = await loadExtraBalance(tx, registrationId, {
      MEMBER: !slots.member && expected && current.memberExtra ? 1 : 0,
      GUEST: guestKits && !slots.guest && expected && current.guestExtra && (current.guestName !== null || current.guestKitOut) ? 1 : 0,
    });
    extraOpen = balance.free;
  }
  // No estoque único, o kit do(a) professor(a) e o do convidado saem do mesmo saldo.
  const take = (kitType: GroupKitType): SlotOutcome => {
    if (!config) return "KIT";
    if (extraOpen >= 1) {
      extraOpen -= 1;
      return "EXTRA";
    }
    const pool = stockPoolFor(config.stockMode, kitType);
    const left = open.get(pool) ?? Number.POSITIVE_INFINITY;
    if (left < 1) return "WAITLIST";
    open.set(pool, left - 1);
    return "KIT";
  };
  if (slots.member) outcome.member = take("MEMBER");
  if (slots.guest) outcome.guest = take("GUEST");

  const update: {
    memberKitWaitlistedAt?: Date | null;
    guestKitWaitlistedAt?: Date | null;
    memberKitExtraAt?: Date | null;
    guestKitExtraAt?: Date | null;
  } = {};
  // Quem já estava na fila mantém o lugar (a hora em que entrou nela).
  if (outcome.member) {
    update.memberKitWaitlistedAt = outcome.member === "WAITLIST" ? (current.memberSince ?? now) : null;
    update.memberKitExtraAt = outcome.member === "EXTRA" ? (current.memberExtra ?? now) : null;
  }
  if (outcome.guest) {
    update.guestKitWaitlistedAt = outcome.guest === "WAITLIST" ? (current.guestSince ?? now) : null;
    update.guestKitExtraAt = outcome.guest === "EXTRA" ? (current.guestExtra ?? now) : null;
  }
  await tx.update(registration).set(update).where(eq(registration.id, registrationId));

  const fromExtra = [
    outcome.member === "EXTRA" && !current.memberExtra ? `o de ${current.name}` : null,
    outcome.guest === "EXTRA" && !current.guestExtra ? `o do convidado ${current.guestName ?? ""}`.trim() : null,
  ].filter(Boolean);
  if (fromExtra.length) {
    await writeAudit(tx, actor, {
      action: "KIT_EXTRA_ASSIGNED",
      entityType: "registration",
      entityId: registrationId,
      summary: `Inscrição na hora: ${fromExtra.join(" e ")} sai${fromExtra.length > 1 ? "em" : ""} da gordura.`,
      after: { member: outcome.member, guest: outcome.guest },
    });
  }

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

/** Sem convidado, a vaga do kit dele fica vazia (e sai da fila ou da gordura, se estava). */
export async function clearGuestKitWaitlist(tx: Tx, registrationId: string) {
  await tx.update(registration).set({ guestKitWaitlistedAt: null, guestKitExtraAt: null }).where(eq(registration.id, registrationId));
}

/**
 * A gordura ganhou kits (ou foi cadastrada depois que as inscrições fecharam):
 * quem se inscreveu na hora e ainda não pegou o kit passa para a gordura, por
 * ordem de inscrição. Os kits do oficial que essas pessoas seguravam vagam e a
 * fila anda. Convidado trocado na hora continua no oficial (a vaga já era dele).
 */
export async function moveWalkInsToExtra(tx: Tx, actor: Actor, now = new Date()): Promise<number> {
  const config = await getEventConfig(tx);
  if (!config || now < config.registrationClosesAt) return 0;
  await lockKitAllocation(tx);
  let free = (await loadExtraBalance(tx)).free;
  if (free <= 0) return 0;
  const closes = config.registrationClosesAt;
  const candidates = await tx.execute<{ id: string; kit_type: GroupKitType; name: string }>(sql`
    SELECT id, kit_type, name FROM (
      SELECT r.id, 'MEMBER' AS kit_type, r.created_at AS since, p.full_name AS name
        FROM registration r
        JOIN person p ON p.id = r.member_person_id
       WHERE r.created_at >= ${closes} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.member_kit_extra_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'MEMBER' AND kd.cancelled_at IS NULL)
      UNION ALL
      SELECT r.id, 'GUEST', gl.created_at, gp.full_name
        FROM registration r
        JOIN guest_link gl ON gl.registration_id = r.id AND gl.status = 'ACTIVE'
        JOIN person gp ON gp.id = gl.guest_person_id
       WHERE ${GUEST_KITS} AND gl.created_at >= ${closes} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_extra_at IS NULL
         AND (r.created_at >= ${closes}
              OR NOT EXISTS (SELECT 1 FROM guest_link old WHERE old.registration_id = r.id AND old.created_at < ${closes}))
         AND NOT EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL)
    ) walk_ins
    ORDER BY since, id, kit_type DESC
  `);
  const moved: string[] = [];
  for (const slot of candidates.rows) {
    if (free <= 0) break;
    const [row] = await tx
      .select({ id: registration.id })
      .from(registration)
      .where(eq(registration.id, slot.id))
      .for("update", { skipLocked: true });
    if (!row) continue;
    await tx
      .update(registration)
      .set(slot.kit_type === "MEMBER" ? { memberKitExtraAt: now, memberKitWaitlistedAt: null } : { guestKitExtraAt: now, guestKitWaitlistedAt: null })
      .where(eq(registration.id, slot.id));
    free -= 1;
    moved.push(slot.name);
  }
  if (moved.length) {
    await writeAudit(tx, actor, {
      action: "KIT_EXTRA_ASSIGNED",
      entityType: "stock",
      summary: `Gordura: ${moved.length === 1 ? "o kit de quem se inscreveu na hora passou" : `${moved.length} kits de quem se inscreveu na hora passaram`} para a gordura (${moved.join(", ")}).`,
      after: { moved: moved.length },
    });
    // Os kits do oficial que essas pessoas seguravam vagaram: a fila anda.
    await promoteKitWaitlist(tx, actor);
  }
  return moved.length;
}

/** "Andar a fila agora" (Kits e estoque): para quem entrega kits. */
export async function advanceKitWaitlist(actor: Actor) {
  assertPermission(actor, "deliverKits");
  return withTx(async (tx) => (await promoteKitWaitlist(tx, actor)).length);
}
