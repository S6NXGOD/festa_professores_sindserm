import "server-only";
import { eq, ne, sql } from "drizzle-orm";
import type { Executor } from "@/server/db";
import { eventConfig, kitDelivery, kitStock } from "@/server/db/schema";
import type { EventSettingsData, HelpSettingsData, SigningSettingsData, StockSettingsData } from "@/domain/schemas";
import { STOCK_MODE_LABEL } from "@/domain/labels";
import { employeeStockPool, isLowEmployeeStock, isLowExtraStock, isLowStock, poolsForMode } from "@/domain/rules";
import type { StockMode, StockPool } from "@/domain/types";
import { zonedLocalToUtc } from "@/lib/datetime";
import { type Actor, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { loadExtraBalance, moveWalkInsToExtra, promoteKitWaitlist } from "./kit-waitlist";
import { DomainError } from "./errors";
import { withTx } from "./tx";

export type EventConfig = typeof eventConfig.$inferSelect;

export async function getEventConfig(ex: Executor): Promise<EventConfig | null> {
  const [row] = await ex.select().from(eventConfig).where(eq(eventConfig.id, 1)).limit(1);
  return row ?? null;
}

export type RegistrationWindow =
  | { state: "NOT_CONFIGURED" }
  | { state: "NOT_OPEN"; opensAt: Date; closesAt: Date }
  | { state: "OPEN"; opensAt: Date; closesAt: Date }
  | { state: "CLOSED"; opensAt: Date; closesAt: Date };

export function registrationWindow(config: EventConfig | null, now = new Date()): RegistrationWindow {
  if (!config) return { state: "NOT_CONFIGURED" };
  const period = { opensAt: config.registrationOpensAt, closesAt: config.registrationClosesAt };
  if (now < config.registrationOpensAt) return { state: "NOT_OPEN", ...period };
  if (now >= config.registrationClosesAt) return { state: "CLOSED", ...period };
  return { state: "OPEN", ...period };
}

function periodToUtc(data: EventSettingsData) {
  const opensAt = zonedLocalToUtc(data.registrationOpensAt);
  const closesAt = zonedLocalToUtc(data.registrationClosesAt);
  if (!opensAt || !closesAt) {
    throw new DomainError("VALIDATION", "Período de inscrições inválido.", {
      registrationOpensAt: "Data e hora inválidas",
    });
  }
  if (closesAt <= opensAt) {
    throw new DomainError("VALIDATION", "Período de inscrições inválido.", {
      registrationClosesAt: "O encerramento deve ser depois da abertura",
    });
  }
  return { opensAt, closesAt };
}

/** "19:00" -> "19:00:00" (mesmo formato que o PostgreSQL devolve para colunas time). */
function withSeconds<T extends string | null>(time: T): T {
  return (time && time.length === 5 ? `${time}:00` : time) as T;
}

function eventValues(data: EventSettingsData) {
  const { opensAt, closesAt } = periodToUtc(data);
  return {
    name: data.name,
    description: data.description,
    eventDate: data.eventDate,
    startTime: withSeconds(data.startTime),
    endTime: withSeconds(data.endTime),
    registrationOpensAt: opensAt,
    registrationClosesAt: closesAt,
    kitDeadlineTime: withSeconds(data.kitDeadlineTime),
  };
}

function desiredTotals(stock: StockSettingsData): Partial<Record<StockPool, number>> {
  if (stock.stockMode === "UNIFIED") return { ALL: stock.totalAll ?? 0 };
  const employees = { EMPLOYEE: stock.totalEmployee ?? 0 };
  return stock.stockMode === "SINGLE"
    ? { ALL: stock.totalAll ?? 0, ...employees }
    : { MEMBER: stock.totalMember ?? 0, GUEST: stock.totalGuest ?? 0, ...employees };
}

/** Os estoques oficiais do modo (a gordura fica à parte). */
function officialPools(mode: StockMode): Exclude<StockPool, "EXTRA">[] {
  return poolsForMode(mode).filter((pool): pool is Exclude<StockPool, "EXTRA"> => pool !== "EXTRA");
}

/** Conclui o wizard: cria a configuração do evento e o estoque inicial. */
export async function completeSetup(actor: Actor, input: { event: EventSettingsData; stock: StockSettingsData }) {
  assertPermission(actor, "manageSettings");
  return withTx(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('event_config_setup'))`);
    if (await getEventConfig(tx)) {
      throw new DomainError("CONFLICT", "A configuração inicial já foi concluída.");
    }
    const values = eventValues(input.event);
    await tx.insert(eventConfig).values({
      id: 1,
      ...values,
      stockMode: input.stock.stockMode,
      lowStockThreshold: input.stock.lowStockThreshold,
      setupCompletedAt: new Date(),
    });
    const totals = desiredTotals(input.stock);
    for (const pool of poolsForMode(input.stock.stockMode)) {
      await tx.insert(kitStock).values({ pool, total: totals[pool] ?? 0, delivered: 0 });
    }
    await writeAudit(tx, actor, {
      action: "SETUP_COMPLETED",
      entityType: "event",
      entityId: "1",
      summary: `Evento "${values.name}" configurado.`,
      after: { ...values, stockMode: input.stock.stockMode, totals, lowStockThreshold: input.stock.lowStockThreshold },
    });
  });
}

export async function updateEventSettings(actor: Actor, data: EventSettingsData) {
  assertPermission(actor, "manageSettings");
  return withTx(async (tx) => {
    const [current] = await tx.select().from(eventConfig).where(eq(eventConfig.id, 1)).for("update");
    if (!current) throw new DomainError("INVALID_STATE", "Conclua a configuração inicial primeiro.");
    const values = eventValues(data);
    await tx.update(eventConfig).set(values).where(eq(eventConfig.id, 1));
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const previous = current[key as keyof typeof current];
      const same =
        previous instanceof Date && value instanceof Date ? previous.getTime() === value.getTime() : previous === value;
      if (!same) {
        before[key] = previous;
        after[key] = value;
      }
    }
    await writeAudit(tx, actor, {
      action: "SETTINGS_UPDATED",
      entityType: "event",
      entityId: "1",
      summary: `Configurações do evento alteradas (${Object.keys(after).join(", ") || "sem mudanças"}).`,
      before,
      after,
    });
  });
}

/**
 * Kits entregues por estoque: professoras, professores e convidados deles (MEMBER, GUEST) e
 * o estoque dos funcionários (EMPLOYEE: o kit do funcionário e o do convidado dele).
 */
async function deliveredByGroup(ex: Executor) {
  // Os kits da gordura (inscrição na hora) têm estoque próprio: não entram nos do oficial.
  const result = await ex.execute<{ member: number; guest: number; employee: number }>(sql`
    SELECT count(*) FILTER (WHERE ${kitDelivery.employeeId} IS NULL AND ${kitDelivery.kitType} = 'MEMBER')::int AS member,
           count(*) FILTER (WHERE ${kitDelivery.employeeId} IS NULL AND ${kitDelivery.kitType} = 'GUEST')::int AS guest,
           count(*) FILTER (WHERE ${kitDelivery.employeeId} IS NOT NULL)::int AS employee
      FROM ${kitDelivery}
     WHERE ${kitDelivery.cancelledAt} IS NULL AND ${kitDelivery.stockPool} <> 'EXTRA'
  `);
  const row = result.rows[0];
  return { MEMBER: Number(row?.member ?? 0), GUEST: Number(row?.guest ?? 0), EMPLOYEE: Number(row?.employee ?? 0) };
}

/**
 * Altera quantidades/modo do estoque. O total nunca pode ficar abaixo do que já
 * foi entregue; os contadores são recalculados a partir das entregas.
 */
export async function updateStockSettings(actor: Actor, stock: StockSettingsData) {
  assertPermission(actor, "manageSettings");
  return withTx(async (tx) => {
    const [config] = await tx.select().from(eventConfig).where(eq(eventConfig.id, 1)).for("update");
    if (!config) throw new DomainError("INVALID_STATE", "Conclua a configuração inicial primeiro.");
    const previousPools = await tx.select().from(kitStock).for("update");
    const delivered = await deliveredByGroup(tx);
    const totals = desiredTotals(stock);
    const deliveredPerPool: Record<Exclude<StockPool, "EXTRA">, number> = {
      // No estoque único para todos, o geral também conta os kits de colaboradores e cortesias.
      ALL: delivered.MEMBER + delivered.GUEST + (stock.stockMode === "UNIFIED" ? delivered.EMPLOYEE : 0),
      MEMBER: delivered.MEMBER,
      GUEST: delivered.GUEST,
      EMPLOYEE: delivered.EMPLOYEE,
    };
    const fieldFor: Record<Exclude<StockPool, "EXTRA">, string> = {
      ALL: "totalAll",
      MEMBER: "totalMember",
      GUEST: "totalGuest",
      EMPLOYEE: "totalEmployee",
    };
    const fieldErrors: Record<string, string> = {};
    for (const pool of officialPools(stock.stockMode)) {
      if ((totals[pool] ?? 0) < deliveredPerPool[pool]) {
        fieldErrors[fieldFor[pool]] = `Já foram entregues ${deliveredPerPool[pool]} kits; o total não pode ser menor.`;
      }
    }
    if (Object.keys(fieldErrors).length) {
      throw new DomainError("VALIDATION", "Quantidade menor do que os kits já entregues.", fieldErrors);
    }
    // A gordura tem quantidade própria (Mesa dos kits e gordura): não muda aqui.
    await tx.delete(kitStock).where(ne(kitStock.pool, "EXTRA"));
    for (const pool of officialPools(stock.stockMode)) {
      await tx.insert(kitStock).values({ pool, total: totals[pool] ?? 0, delivered: deliveredPerPool[pool] });
    }
    await tx
      .update(eventConfig)
      .set({ stockMode: stock.stockMode, lowStockThreshold: stock.lowStockThreshold })
      .where(eq(eventConfig.id, 1));
    await writeAudit(tx, actor, {
      action: "STOCK_UPDATED",
      entityType: "stock",
      summary: `Estoque alterado: ${STOCK_MODE_LABEL[stock.stockMode].toLowerCase()}.`,
      before: {
        stockMode: config.stockMode,
        lowStockThreshold: config.lowStockThreshold,
        pools: previousPools.map((p) => ({ pool: p.pool, total: p.total, delivered: p.delivered })),
      },
      after: { stockMode: stock.stockMode, lowStockThreshold: stock.lowStockThreshold, totals },
    });
    // Mais kits no estoque: a fila do kit anda (por ordem).
    const promoted = await promoteKitWaitlist(tx, actor);
    return { promoted: promoted.length };
  });
}

/**
 * Mesa dos kits e gordura (decisão da organização para a festa):
 * - onde o kit sai: na portaria, junto com a entrada, ou na mesa dos kits, depois da entrada;
 * - gordura: kits separados do oficial para quem se inscreve na hora.
 * A gordura não pode ficar abaixo do que já foi entregue nem do que já foi prometido.
 * Com mais gordura, quem se inscreveu na hora e ainda está no oficial (ou na fila) passa para ela.
 */
export async function updateKitDeskSettings(actor: Actor, input: { kitsAtDesk: boolean; extraTotal: number }, now = new Date()) {
  assertPermission(actor, "manageSettings");
  const extraTotal = Math.trunc(Number(input.extraTotal));
  if (!Number.isFinite(extraTotal) || extraTotal < 0 || extraTotal > 100000) {
    throw new DomainError("VALIDATION", "Quantidade da gordura inválida.", { extraTotal: "Informe um número de 0 a 100000" });
  }
  const kitsAtDesk = input.kitsAtDesk === true;
  return withTx(async (tx) => {
    const [config] = await tx.select().from(eventConfig).where(eq(eventConfig.id, 1)).for("update");
    if (!config) throw new DomainError("INVALID_STATE", "Conclua a configuração inicial primeiro.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('kit_allocation'))`);
    const balance = await loadExtraBalance(tx);
    const floor = Math.max(balance.delivered, balance.committed);
    if (extraTotal < floor) {
      throw new DomainError("VALIDATION", "Gordura menor do que os kits dela já prometidos.", {
        extraTotal: `Já tem ${floor} ${floor === 1 ? "kit prometido" : "kits prometidos"} a quem se inscreveu na hora; o total não pode ser menor.`,
      });
    }
    await tx
      .insert(kitStock)
      .values({ pool: "EXTRA", total: extraTotal, delivered: balance.delivered })
      .onConflictDoUpdate({ target: kitStock.pool, set: { total: extraTotal } });
    if (config.kitsAtDesk !== kitsAtDesk) {
      await tx.update(eventConfig).set({ kitsAtDesk }).where(eq(eventConfig.id, 1));
    }
    const changes = [
      config.kitsAtDesk !== kitsAtDesk ? (kitsAtDesk ? "os kits passam a sair na mesa dos kits" : "os kits voltam a sair na portaria, com a entrada") : null,
      balance.total !== extraTotal ? `gordura de ${balance.total} para ${extraTotal} kits` : null,
    ].filter(Boolean);
    await writeAudit(tx, actor, {
      action: "KIT_DESK_SETTINGS_UPDATED",
      entityType: "stock",
      summary: changes.length ? `Mesa dos kits e gordura: ${changes.join("; ")}.` : "Mesa dos kits e gordura: sem mudanças.",
      before: { kitsAtDesk: config.kitsAtDesk, extraTotal: balance.total },
      after: { kitsAtDesk, extraTotal },
    });
    // Mais gordura: quem se inscreveu na hora e ficou no oficial (ou na fila) passa para ela.
    const moved = extraTotal > balance.total ? await moveWalkInsToExtra(tx, actor, now) : 0;
    return { moved };
  });
}

/** WhatsApp para dúvidas (botão de ajuda). Vazio remove o botão. */
export async function updateHelpSettings(actor: Actor, data: HelpSettingsData) {
  assertPermission(actor, "manageSettings");
  return withTx(async (tx) => {
    const [current] = await tx.select().from(eventConfig).where(eq(eventConfig.id, 1)).for("update");
    if (!current) throw new DomainError("INVALID_STATE", "Conclua a configuração inicial primeiro.");
    if (current.helpWhatsapp === data.helpWhatsapp) return;
    await tx.update(eventConfig).set({ helpWhatsapp: data.helpWhatsapp }).where(eq(eventConfig.id, 1));
    await writeAudit(tx, actor, {
      action: "HELP_CONTACT_UPDATED",
      entityType: "event",
      entityId: "1",
      summary: data.helpWhatsapp ? "WhatsApp de ajuda atualizado." : "WhatsApp de ajuda removido.",
      before: { helpWhatsapp: current.helpWhatsapp },
      after: { helpWhatsapp: data.helpWhatsapp },
    });
  });
}

/** WhatsApp da secretaria para receber as fichas assinadas pelo gov.br. Vazio: vale o WhatsApp de ajuda. */
export async function updateSigningSettings(actor: Actor, data: SigningSettingsData) {
  assertPermission(actor, "manageSettings");
  return withTx(async (tx) => {
    const [current] = await tx.select().from(eventConfig).where(eq(eventConfig.id, 1)).for("update");
    if (!current) throw new DomainError("INVALID_STATE", "Conclua a configuração inicial primeiro.");
    if (current.formsWhatsapp === data.formsWhatsapp) return;
    await tx.update(eventConfig).set({ formsWhatsapp: data.formsWhatsapp }).where(eq(eventConfig.id, 1));
    await writeAudit(tx, actor, {
      action: "FORMS_CONTACT_UPDATED",
      entityType: "event",
      entityId: "1",
      summary: data.formsWhatsapp ? "WhatsApp das fichas assinadas atualizado." : "WhatsApp das fichas assinadas removido (vale o de ajuda).",
      before: { formsWhatsapp: current.formsWhatsapp },
      after: { formsWhatsapp: data.formsWhatsapp },
    });
  });
}

/**
 * Mensagem de divulgação da organização (vazio = volta a mensagem automática,
 * montada com os dados da festa).
 */
export async function updateShareMessage(actor: Actor, raw: string | null) {
  assertPermission(actor, "manageSettings");
  const message = raw?.trim() ? raw.trim().slice(0, 2000) : null;
  return withTx(async (tx) => {
    const [current] = await tx.select().from(eventConfig).where(eq(eventConfig.id, 1)).for("update");
    if (!current) throw new DomainError("INVALID_STATE", "Conclua a configuração inicial primeiro.");
    if (current.shareMessage === message) return;
    await tx.update(eventConfig).set({ shareMessage: message }).where(eq(eventConfig.id, 1));
    await writeAudit(tx, actor, {
      action: "SHARE_MESSAGE_UPDATED",
      entityType: "event",
      entityId: "1",
      summary: message ? "Mensagem de divulgação salva." : "Mensagem de divulgação voltou a ser a automática.",
      before: { shareMessage: current.shareMessage },
      after: { shareMessage: message },
    });
  });
}

export interface StockPoolView {
  pool: StockPool;
  total: number;
  delivered: number;
  available: number;
  low: boolean;
  /** Só no estoque dos funcionários: quantos kits ainda vão sair (funcionários e convidados deles). */
  awaiting?: number;
}

/** Kits do estoque dos funcionários que ainda vão sair: funcionários na lista sem kit e convidados deles sem kit. */
export async function countEmployeesAwaitingKit(ex: Executor): Promise<number> {
  const result = await ex.execute<{ total: number }>(sql`
    SELECT (SELECT count(*)
              FROM employee e
             WHERE e.removed_at IS NULL
               AND e.with_kit
               AND NOT EXISTS (SELECT 1 FROM kit_delivery kd
                                WHERE kd.employee_id = e.id AND kd.kit_type = 'EMPLOYEE' AND kd.cancelled_at IS NULL))
         + (SELECT count(*)
              FROM guest_link gl
              JOIN employee e ON e.id = gl.employee_id
             WHERE gl.status = 'ACTIVE' AND e.removed_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM kit_delivery kd
                                WHERE kd.employee_id = e.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
           AS total
  `);
  return Number(result.rows[0]?.total ?? 0);
}

/** A gordura: estoque separado do oficial para quem se inscreve na hora. */
export interface ExtraStockView {
  total: number;
  delivered: number;
  /** Ainda na caixa. */
  available: number;
  /** Prometidos a quem se inscreveu na hora (inclui os entregues). */
  committed: number;
  /** Sem dono: dá para mais inscrições na hora. */
  free: number;
  low: boolean;
}

export interface StockOverview {
  mode: StockMode;
  threshold: number;
  /** Os estoques oficiais (a gordura fica em `extra`). */
  pools: StockPoolView[];
  /** Gordura cadastrada (nula quando nunca teve kits). */
  extra: ExtraStockView | null;
  /** Onde o kit sai: na mesa dos kits (verdadeiro) ou na portaria, com a entrada. */
  kitsAtDesk: boolean;
  totalStock: number;
  totalDelivered: number;
  totalAvailable: number;
  anyLow: boolean;
}

/** O estoque de onde saem os kits de colaboradores, convidados deles e cortesias (no estoque único, o geral). */
export function employeePoolOf(stock: StockOverview | null): StockPoolView | null {
  if (!stock) return null;
  return stock.pools.find((pool) => pool.pool === employeeStockPool(stock.mode)) ?? null;
}

export async function getStockOverview(ex: Executor): Promise<StockOverview | null> {
  const config = await getEventConfig(ex);
  if (!config) return null;
  const [rows, extraBalance] = await Promise.all([ex.select().from(kitStock), loadExtraBalance(ex)]);
  const order: StockPool[] = ["ALL", "MEMBER", "GUEST", "EMPLOYEE"];
  const visible = rows
    .filter((r) => poolsForMode(config.stockMode).includes(r.pool))
    // Estoque de funcionários sem uso (zerado e nada entregue) não aparece nem gera alerta.
    .filter((r) => r.pool !== "EMPLOYEE" || r.total > 0 || r.delivered > 0)
    .sort((a, b) => order.indexOf(a.pool) - order.indexOf(b.pool));
  const awaiting = visible.some((r) => r.pool === "EMPLOYEE") ? await countEmployeesAwaitingKit(ex) : 0;
  const pools = visible.map((r): StockPoolView => {
    const available = r.total - r.delivered;
    if (r.pool === "EMPLOYEE") {
      return { pool: r.pool, total: r.total, delivered: r.delivered, available, low: isLowEmployeeStock(available, awaiting), awaiting };
    }
    return { pool: r.pool, total: r.total, delivered: r.delivered, available, low: isLowStock(available, config.lowStockThreshold) };
  });
  const extraRow = rows.find((r) => r.pool === "EXTRA");
  const extra: ExtraStockView | null =
    extraRow && (extraRow.total > 0 || extraRow.delivered > 0)
      ? {
          total: extraRow.total,
          delivered: extraRow.delivered,
          available: extraRow.total - extraRow.delivered,
          committed: extraBalance.committed,
          free: extraBalance.free,
          low: isLowExtraStock(extraRow.total - extraRow.delivered, extraRow.total),
        }
      : null;
  return {
    mode: config.stockMode,
    threshold: config.lowStockThreshold,
    pools,
    extra,
    kitsAtDesk: config.kitsAtDesk,
    totalStock: pools.reduce((s, p) => s + p.total, 0),
    totalDelivered: pools.reduce((s, p) => s + p.delivered, 0),
    totalAvailable: pools.reduce((s, p) => s + p.available, 0),
    anyLow: pools.some((p) => p.low),
  };
}
