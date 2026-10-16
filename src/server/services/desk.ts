import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Executor } from "@/server/db";
import { registration } from "@/server/db/schema";
import type { AccessMap } from "@/domain/access";
import { formatTime } from "@/lib/datetime";
import { isKitDeadlinePassed, kitDeadlineAt } from "@/domain/kit-deadline";
import { EMPLOYEE_CATEGORY_LABEL } from "@/domain/labels";
import { can, employeeKitAvailability, isActiveMember, kitAvailability, type KitAvailability } from "@/domain/rules";
import type { EmployeeCategory, GroupKitType, KitType, ParticipantRole, StockPool } from "@/domain/types";
import { displayCpf } from "@/lib/cpf";
import { formatShortDateTime } from "@/lib/datetime";
import { formatVoucherCode } from "@/server/crypto";
import { type Actor, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { lockPersonWithGroups } from "./checkin";
import { DESK_BLOCK_MESSAGE, type DeskKit, deskRoleOf, evaluateDeskKit, hasMinorKit, walkInOf } from "./desk-kit";
import { DomainError, isUniqueViolation } from "./errors";
import { employeeKitInput, hasEmployeeStock, kitInput, recordEmployeeKitDelivery, recordKitDelivery } from "./kits";
import { getEventConfig, getStockOverview } from "./settings";
import { loadPersonState, type PersonState } from "./state";
import { withTx } from "./tx";

export type { DeskKit } from "./desk-kit";

/** Tudo o que a mesa precisa para conferir e entregar o kit de uma pessoa. */
export interface DeskView {
  personId: string;
  fullName: string;
  /** CPF para conferir (completo ou mascarado, conforme a permissão; "Sem CPF"). */
  cpf: string;
  voucherCode: string | null;
  isMinor: boolean;
  /** Quem é: "Professor(a) filiado(a)", "Convidado(a) de Carla Mendes", "Cortesia da organização"... */
  roleLabel: string;
  /** Validada na entrada (pela segurança): quando e por quem. */
  entry: { at: Date; byName: string } | null;
  /** Inscrição feita na hora: o kit é o da gordura. */
  walkIn: boolean;
  kit: DeskKit;
  /** Onde o kit sai hoje (a mesa também resolve kits que não saíram na portaria). */
  kitsAtDesk: boolean;
  /** Kits guardados até este horário; depois, sobras por ordem de chegada. */
  kitDeadline: { label: string; passed: boolean } | null;
}

function employeeLabel(category: EmployeeCategory): string {
  return category === "COURTESY" ? "Cortesia da organização" : `${EMPLOYEE_CATEGORY_LABEL[category]} · SINDSERM`;
}

export function deskRoleLabel(state: PersonState): string {
  if (state.employee?.active) return employeeLabel(state.employee.category);
  const own = state.ownRegistration;
  if (own && isActiveMember(own.status)) return own.isTeacher ? "Professor(a) filiado(a)" : "Filiado(a), não é professor(a)";
  if (state.guestOf) return `Convidado(a) de ${state.guestOf.host.member.fullName}`;
  if (state.guestOfEmployee) return `Convidado(a) de ${state.guestOfEmployee.host.person.fullName} (SINDSERM)`;
  if (own) return "Filiação ainda não confirmada";
  return "Sem inscrição";
}

export function buildDeskView(
  state: PersonState,
  access: AccessMap,
  config: Awaited<ReturnType<typeof getEventConfig>>,
  stock: Awaited<ReturnType<typeof getStockOverview>>,
  now = new Date(),
): DeskView {
  const deadline = config ? kitDeadlineAt(config) : null;
  return {
    personId: state.person.id,
    fullName: state.person.fullName,
    cpf: displayCpf(state.person.cpf, can(access, "viewFullCpf")),
    voucherCode: state.voucher ? formatVoucherCode(state.voucher.code) : null,
    isMinor: state.person.isMinor,
    roleLabel: deskRoleLabel(state),
    entry: state.checkIn ? { at: state.checkIn.checkedInAt, byName: state.checkIn.checkedInByName } : null,
    walkIn: walkInOf(state),
    kit: evaluateDeskKit(state, config, now, stock),
    kitsAtDesk: Boolean(config?.kitsAtDesk),
    kitDeadline: deadline ? { label: formatTime(deadline), passed: isKitDeadlinePassed(config, now) } : null,
  };
}

export async function loadDeskView(ex: Executor, personId: string, access: AccessMap): Promise<DeskView | null> {
  const [state, config, stock] = await Promise.all([loadPersonState(ex, personId), getEventConfig(ex), getStockOverview(ex)]);
  return state ? buildDeskView(state, access, config, stock) : null;
}

export interface DeskDeliveryResult {
  personName: string;
  kitType: KitType;
  pool: StockPool;
  extra: boolean;
  /** Quantos kits ainda há na caixa de onde este saiu. */
  available: number;
  low: boolean;
}

/** Já entregue ou bloqueado: a mensagem certa para quem está na mesa. */
function assertDeliverable(availability: KitAvailability, personId: string) {
  if (availability.kind === "DELIVERED") {
    const delivery = availability.delivery;
    throw new DomainError(
      "ALREADY_DELIVERED",
      delivery.beneficiaryPersonId === personId
        ? `Kit já entregue em ${formatShortDateTime(delivery.deliveredAt)} por ${delivery.deliveredByName}. Não entregue de novo.`
        : `O kit de convidado deste grupo já saiu para ${delivery.beneficiaryName}.`,
    );
  }
  if (availability.kind === "BLOCKED") throw new DomainError("KIT_NOT_AVAILABLE", DESK_BLOCK_MESSAGE[availability.code]);
}

/**
 * Entrega na mesa: só para quem já passou pela entrada (validada pela
 * segurança). Dá baixa no estoque certo (oficial ou gordura) e registra a
 * entrega, para a pessoa não pegar outro kit. `leftover`: kit de sobra para
 * quem está na fila do kit (decisão da equipe, fica na auditoria).
 */
export async function deliverAtDesk(
  actor: Actor,
  input: { personId: string; leftover?: boolean },
  now = new Date(),
): Promise<DeskDeliveryResult> {
  assertPermission(actor, "deliverKits");
  try {
    return await withTx(async (tx) => {
      const state = await lockPersonWithGroups(tx, String(input.personId));
      if (!state.checkIn) {
        throw new DomainError("INVALID_STATE", "Ainda não passou pela entrada: mande para a segurança registrar a entrada.");
      }
      const config = await getEventConfig(tx);
      if (!config) throw new DomainError("INVALID_STATE", "Estoque não configurado.");
      const deadlinePassed = isKitDeadlinePassed(config, now);
      // Na mesa dos kits, o convidado não espera quem convidou.
      const guestIndependent = config.kitsAtDesk;
      // O papel de agora (ex.: convidado que virou filiado depois de entrar pega o kit de filiado).
      const role = deskRoleOf(state);
      if (!role) throw new DomainError("KIT_NOT_AVAILABLE", DESK_BLOCK_MESSAGE.NO_KIT);

      const employeeGroup = role === "EMPLOYEE" ? state.employee : role === "GUEST_OF_EMPLOYEE" ? (state.guestOfEmployee?.host ?? null) : null;
      if (employeeGroup) {
        const kitType = role === "EMPLOYEE" ? "EMPLOYEE" : "GUEST";
        if (kitType === "GUEST" && employeeGroup.guest?.personId !== state.person.id) {
          throw new DomainError("KIT_NOT_AVAILABLE", DESK_BLOCK_MESSAGE.NO_KIT);
        }
        assertDeliverable(employeeKitAvailability(employeeKitInput(employeeGroup, deadlinePassed, { guestIndependent }), kitType), state.person.id);
        if (!(await hasEmployeeStock(tx))) throw new DomainError("OUT_OF_STOCK", DESK_BLOCK_MESSAGE.NO_EMPLOYEE_STOCK);
        const done = await recordEmployeeKitDelivery(tx, actor, employeeGroup, kitType, "DESK");
        return { personName: state.person.fullName, kitType, pool: done.stock.pool, extra: false, available: done.stock.available, low: done.stock.low };
      }

      const group = role === "MEMBER" ? state.ownRegistration : (state.guestOf?.host ?? null);
      if (!group) throw new DomainError("KIT_NOT_AVAILABLE", DESK_BLOCK_MESSAGE.NO_KIT);
      const kitType: GroupKitType = role === "MEMBER" ? "MEMBER" : "GUEST";
      if (kitType === "GUEST" && group.guest?.personId !== state.person.id) {
        throw new DomainError("KIT_NOT_AVAILABLE", DESK_BLOCK_MESSAGE.NO_KIT);
      }
      if (input.leftover && group.kitWaitlist[kitType]) {
        // Sobrou kit: a equipe decide entregar para quem está na fila (sai da fila e o kit sai do estoque).
        await tx
          .update(registration)
          .set(kitType === "MEMBER" ? { memberKitWaitlistedAt: null } : { guestKitWaitlistedAt: null })
          .where(eq(registration.id, group.id));
        group.kitWaitlist[kitType] = null;
        await writeAudit(tx, actor, {
          action: "KIT_LEFTOVER_RELEASED",
          entityType: "registration",
          entityId: group.id,
          summary: `Kit de sobra liberado na mesa dos kits para ${state.person.fullName}, que estava na fila do kit.`,
        });
      }
      assertDeliverable(kitAvailability(kitInput(group, deadlinePassed, { guestIndependent }), kitType), state.person.id);
      const done = await recordKitDelivery(tx, actor, group, kitType, config, "DESK");
      return {
        personName: state.person.fullName,
        kitType,
        pool: done.stock.pool,
        extra: done.stock.pool === "EXTRA",
        available: done.stock.available,
        low: done.stock.low,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error, "kit_delivery_once_per_type") || isUniqueViolation(error, "kit_delivery_once_per_employee")) {
      throw new DomainError("ALREADY_DELIVERED", "O kit desta pessoa acabou de ser entregue. Não entregue de novo.");
    }
    if (error instanceof DomainError && error.code === "OUT_OF_STOCK" && error.message === "Estoque de kits esgotado.") {
      throw new DomainError("OUT_OF_STOCK", "A caixa deste kit acabou: avise a organização.");
    }
    throw error;
  }
}

/** Quem passou pela entrada e ainda não pegou o kit (a fila da mesa). */
export interface DeskQueueItem {
  personId: string;
  fullName: string;
  isMinor: boolean;
  checkedInAt: Date;
  checkedInByName: string;
  role: ParticipantRole;
  /** "Convidado(a) de Carla Mendes", "Cortesia", "Professor(a)". */
  roleLabel: string;
  /** Kit da gordura (inscrição na hora). */
  extra: boolean;
  /** Na fila do kit (pode não sair agora). */
  waitlisted: boolean;
  /** Código do voucher, para conferir com o que a pessoa mostra. */
  voucherCode: string | null;
  /** Dá para entregar direto da lista (botão rápido); senão, abre o cartão e ele explica por quê. */
  quick: boolean;
}

export interface DeskQueue {
  items: DeskQueueItem[];
  /** Total de quem está esperando o kit (a lista mostra os mais recentes). */
  pending: number;
  /** Kits entregues na festa até agora. */
  delivered: number;
  /** A montagem tem kit de menor de 18: a confirmação rápida avisa. */
  minorKit: boolean;
}

/**
 * A fila da mesa: entrou, tem direito a kit e o kit ainda não saiu. A conferência
 * de verdade é na entrega (mesma regra do resto do sistema); aqui é a lista de quem procurar.
 */
export async function listDeskQueue(ex: Executor, limit = 40): Promise<DeskQueue> {
  const result = await ex.execute<{
    person_id: string;
    full_name: string;
    is_minor: boolean;
    checked_in_at: Date | string;
    checked_in_by: string;
    role: ParticipantRole;
    host_name: string | null;
    host_employee_name: string | null;
    employee_category: EmployeeCategory | null;
    is_teacher: boolean | null;
    extra: boolean;
    waitlisted: boolean;
    voucher_code: string | null;
    host_in: boolean;
    total: number;
  }>(sql`
    WITH waiting AS (
      SELECT ci.person_id, p.full_name, p.is_minor, ci.checked_in_at, u.name AS checked_in_by, ci.role::text AS role,
             (SELECT v.code FROM voucher v WHERE v.person_id = ci.person_id AND v.revoked_at IS NULL LIMIT 1) AS voucher_code,
             -- Convidado: quem convidou já entrou? (com o kit na portaria, o do convidado espera essa chegada)
             EXISTS (SELECT 1 FROM check_in hc
                      WHERE hc.cancelled_at IS NULL AND hc.person_id = COALESCE(hr.member_person_id, he.person_id)) AS host_in,
             hp.full_name AS host_name, hep.full_name AS host_employee_name, e.category::text AS employee_category, r.is_teacher,
             COALESCE(CASE WHEN ci.role = 'MEMBER' THEN r.member_kit_extra_at IS NOT NULL
                           WHEN ci.role = 'GUEST' THEN hr.guest_kit_extra_at IS NOT NULL END, false) AS extra,
             COALESCE(CASE WHEN ci.role = 'MEMBER' THEN r.member_kit_waitlisted_at IS NOT NULL
                           WHEN ci.role = 'GUEST' THEN hr.guest_kit_waitlisted_at IS NOT NULL END, false) AS waitlisted
        FROM check_in ci
        JOIN person p ON p.id = ci.person_id
        JOIN "user" u ON u.id = ci.checked_in_by_user_id
        LEFT JOIN registration r ON ci.role = 'MEMBER' AND r.member_person_id = ci.person_id
        LEFT JOIN guest_link gl ON ci.role = 'GUEST' AND gl.guest_person_id = ci.person_id AND gl.status = 'ACTIVE'
        LEFT JOIN registration hr ON hr.id = gl.registration_id
        LEFT JOIN person hp ON hp.id = hr.member_person_id
        LEFT JOIN employee he ON he.id = gl.employee_id
        LEFT JOIN person hep ON hep.id = he.person_id
        LEFT JOIN employee e ON ci.role = 'EMPLOYEE' AND e.person_id = ci.person_id AND e.removed_at IS NULL
       WHERE ci.cancelled_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.beneficiary_person_id = ci.person_id AND kd.cancelled_at IS NULL)
         AND (
           (ci.role = 'MEMBER' AND r.is_teacher AND r.status IN ('CONFIRMED', 'JOINED_AT_EVENT'))
           OR (ci.role = 'GUEST' AND hr.id IS NOT NULL AND hr.is_teacher AND hr.status IN ('CONFIRMED', 'JOINED_AT_EVENT')
               AND NOT EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = hr.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
           OR (ci.role = 'GUEST' AND he.id IS NOT NULL AND he.removed_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.employee_id = he.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
           OR (ci.role = 'EMPLOYEE' AND e.id IS NOT NULL AND e.with_kit)
         )
    )
    SELECT *, count(*) OVER ()::int AS total FROM waiting ORDER BY checked_in_at DESC LIMIT ${limit}
  `);
  const [delivered, config] = await Promise.all([
    ex.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM kit_delivery WHERE cancelled_at IS NULL`),
    getEventConfig(ex),
  ]);
  const deadlinePassed = isKitDeadlinePassed(config);
  const atDesk = Boolean(config?.kitsAtDesk);
  const items = result.rows.map((row): DeskQueueItem => {
    const roleLabel =
      row.role === "EMPLOYEE"
        ? row.employee_category
          ? employeeLabel(row.employee_category)
          : "SINDSERM"
        : row.role === "GUEST"
          ? `Convidado(a) de ${row.host_name ?? row.host_employee_name ?? "—"}`
          : "Professor(a) filiado(a)";
    return {
      personId: row.person_id,
      fullName: row.full_name,
      isMinor: row.is_minor,
      checkedInAt: new Date(row.checked_in_at),
      checkedInByName: row.checked_in_by,
      role: row.role,
      roleLabel,
      extra: row.extra,
      waitlisted: row.waitlisted,
      voucherCode: row.voucher_code ? formatVoucherCode(row.voucher_code) : null,
      // Fila do kit antes do horário e convidado esperando quem convidou (kit na portaria): abre o cartão.
      quick: !(row.waitlisted && !deadlinePassed) && !(row.role === "GUEST" && !atDesk && !row.host_in),
    };
  });
  return {
    items,
    pending: Number(result.rows[0]?.total ?? 0),
    delivered: Number(delivered.rows[0]?.total ?? 0),
    minorKit: hasMinorKit(config),
  };
}

/** Kits entregues por uma pessoa da equipe (o placar da mesa). */
export async function countKitsDeliveredBy(ex: Executor, userId: string): Promise<number> {
  const result = await ex.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM kit_delivery WHERE cancelled_at IS NULL AND delivered_by_user_id = ${userId}
  `);
  return Number(result.rows[0]?.total ?? 0);
}

/** O que a mesa precisa saber das caixas: quanto resta no oficial e na gordura. */
export interface DeskStock {
  official: { available: number; low: boolean } | null;
  extra: { available: number; total: number; low: boolean } | null;
  kitsAtDesk: boolean;
}

export function deskStockOf(stock: Awaited<ReturnType<typeof getStockOverview>>): DeskStock {
  if (!stock) return { official: null, extra: null, kitsAtDesk: false };
  return {
    official: stock.pools.length ? { available: stock.totalAvailable, low: stock.anyLow } : null,
    extra: stock.extra ? { available: stock.extra.available, total: stock.extra.total, low: stock.extra.low } : null,
    kitsAtDesk: stock.kitsAtDesk,
  };
}
