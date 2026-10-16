import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { kitDelivery, kitStock, registration } from "@/server/db/schema";
import {
  employeeKitAvailability,
  type EmployeeKitInput,
  employeeStockPool,
  isActiveMember,
  isLowEmployeeStock,
  isLowExtraStock,
  isLowStock,
  kitAvailability,
  type KitRegistrationInput,
  stockPoolFor,
} from "@/domain/rules";
import { isKitDeadlinePassed } from "@/domain/kit-deadline";
import { KIT_BLOCK_MESSAGE, KIT_TYPE_LABEL } from "@/domain/labels";
import { justificationField } from "@/domain/schemas";
import type { EmployeeKitType, GroupKitType, KitType, StockPool } from "@/domain/types";
import { formatShortDateTime } from "@/lib/datetime";
import { type Actor, assertPermission, type StaffActor } from "./actor";
import { writeAudit } from "./audit";
import { DomainError, isUniqueViolation } from "./errors";
import { lockEmployeeGroupWithPeople, lockRegistration, lockRegistrationWithPeople } from "./locks";
import { countEmployeesAwaitingKit, type EventConfig, getEventConfig } from "./settings";
import {
  type EmployeeGroupState,
  findActiveGuestLink,
  findEmployeeIdByPerson,
  findRegistrationIdByMember,
  type RegistrationState,
} from "./state";
import { withTx } from "./tx";

export interface DeliveryResult {
  deliveryId: string;
  kitType: KitType;
  beneficiaryName: string;
  stock: { pool: StockPool; total: number; delivered: number; available: number; low: boolean };
}

/** Entrada da regra de kits a partir do estado (travado) da inscrição. */
export function kitInput(
  state: RegistrationState,
  deadlinePassed: boolean,
  overrides: Partial<KitRegistrationInput> = {},
): KitRegistrationInput {
  return {
    status: state.status,
    isTeacher: state.isTeacher,
    memberCheckedIn: Boolean(state.memberCheckIn),
    hasGuest: Boolean(state.guest),
    guestCheckedIn: Boolean(state.guest?.checkIn),
    deliveries: state.deliveries,
    deadlinePassed,
    memberReceivedGuestKit: state.memberReceivedGuestKit,
    waitlisted: { MEMBER: Boolean(state.kitWaitlist.MEMBER), GUEST: Boolean(state.kitWaitlist.GUEST) },
    ...overrides,
  };
}

/** Entrada da regra de kits a partir do estado (travado) do grupo de um(a) funcionário(a). */
export function employeeKitInput(
  group: EmployeeGroupState,
  deadlinePassed: boolean,
  overrides: Partial<EmployeeKitInput> = {},
): EmployeeKitInput {
  return {
    active: group.active,
    withKit: group.withKit,
    employeeCheckedIn: Boolean(group.checkIn),
    hasGuest: Boolean(group.guest),
    guestCheckedIn: Boolean(group.guest?.checkIn),
    deliveries: group.deliveries,
    deadlinePassed,
    ...overrides,
  };
}

/** Baixa 1 kit do estoque (nunca fica negativo). Sem saldo: DomainError OUT_OF_STOCK. */
async function takeFromStock(tx: Tx, pool: StockPool) {
  const [stock] = await tx
    .update(kitStock)
    .set({ delivered: sql`${kitStock.delivered} + 1` })
    .where(and(eq(kitStock.pool, pool), lt(kitStock.delivered, kitStock.total)))
    .returning({ total: kitStock.total, delivered: kitStock.delivered });
  if (!stock) throw new DomainError("OUT_OF_STOCK", "Estoque de kits esgotado.");
  return stock;
}

/** O estoque de onde saem os kits de colaboradores (e cortesias) existe e tem kits cadastrados? */
export async function hasEmployeeStock(tx: Tx): Promise<boolean> {
  const config = await getEventConfig(tx);
  if (!config) return false;
  const [row] = await tx
    .select({ total: kitStock.total })
    .from(kitStock)
    .where(eq(kitStock.pool, employeeStockPool(config.stockMode)))
    .limit(1);
  return Boolean(row && row.total > 0);
}

/**
 * Grava a entrega: baixa o estoque (sem nunca ficar negativo), registra o kit
 * no grupo do(a) professor(a) e audita. Supõe a inscrição já travada e a
 * disponibilidade já conferida. Estoque zerado: DomainError OUT_OF_STOCK.
 */
/** Onde a entrega aconteceu (vai para a auditoria). */
export type DeliveryContext = "ENTRY" | "MANUAL" | "DESK";

const WHERE_LABEL: Record<DeliveryContext, string> = { ENTRY: " na entrada", MANUAL: "", DESK: " na mesa dos kits" };

/** De qual estoque sai um kit do grupo do(a) professor(a): gordura (inscrição na hora) ou o oficial do modo configurado. */
export function registrationKitPool(state: RegistrationState, kitType: GroupKitType, config: Pick<EventConfig, "stockMode">): StockPool {
  return state.kitExtra[kitType] ? "EXTRA" : stockPoolFor(config.stockMode, kitType);
}

export async function recordKitDelivery(
  tx: Tx,
  actor: StaffActor,
  state: RegistrationState,
  kitType: GroupKitType,
  config: EventConfig,
  context: DeliveryContext,
): Promise<DeliveryResult> {
  const pool = registrationKitPool(state, kitType, config);
  const stock = await takeFromStock(tx, pool);

  const beneficiary =
    kitType === "MEMBER"
      ? { personId: state.member.id, fullName: state.member.fullName, guestLinkId: null }
      : { personId: state.guest!.personId, fullName: state.guest!.fullName, guestLinkId: state.guest!.guestLinkId };
  const [delivery] = await tx
    .insert(kitDelivery)
    .values({
      registrationId: state.id,
      kitType,
      // O kit fica registrado no grupo do(a) professor(a) responsável.
      recipientPersonId: state.member.id,
      beneficiaryPersonId: beneficiary.personId,
      guestLinkId: beneficiary.guestLinkId,
      stockPool: pool,
      deliveredByUserId: actor.userId,
    })
    .returning({ id: kitDelivery.id });

  const where = WHERE_LABEL[context] + (pool === "EXTRA" ? " (gordura)" : "");
  await writeAudit(tx, actor, {
    action: "KIT_DELIVERED",
    entityType: "kit_delivery",
    entityId: delivery!.id,
    summary:
      kitType === "MEMBER"
        ? `Kit entregue${where} a ${state.member.fullName}.`
        : `Kit do convidado ${beneficiary.fullName} entregue${where} (grupo de ${state.member.fullName}).`,
    after: { registrationId: state.id, kitType, pool, context },
  });

  const available = stock.total - stock.delivered;
  const low = pool === "EXTRA" ? isLowExtraStock(available, stock.total) : isLowStock(available, config.lowStockThreshold);
  return {
    deliveryId: delivery!.id,
    kitType,
    beneficiaryName: beneficiary.fullName,
    stock: { pool, ...stock, available, low },
  };
}

/**
 * Kit do grupo de um(a) funcionário(a) — o dele(a) ou o do convidado —, sempre
 * do estoque dos funcionários. Supõe o grupo travado e a regra já conferida.
 */
export async function recordEmployeeKitDelivery(
  tx: Tx,
  actor: StaffActor,
  group: EmployeeGroupState,
  kitType: EmployeeKitType,
  context: DeliveryContext,
): Promise<DeliveryResult> {
  const config = await getEventConfig(tx);
  // Estoque dos colaboradores ou, no estoque único para todos, o geral.
  const pool = config ? employeeStockPool(config.stockMode) : "EMPLOYEE";
  const stock = await takeFromStock(tx, pool);
  const beneficiary =
    kitType === "EMPLOYEE"
      ? { personId: group.person.id, fullName: group.person.fullName, guestLinkId: null }
      : { personId: group.guest!.personId, fullName: group.guest!.fullName, guestLinkId: group.guest!.guestLinkId };
  const [delivery] = await tx
    .insert(kitDelivery)
    .values({
      employeeId: group.id,
      kitType,
      // O kit fica registrado no grupo do(a) funcionário(a).
      recipientPersonId: group.person.id,
      beneficiaryPersonId: beneficiary.personId,
      guestLinkId: beneficiary.guestLinkId,
      stockPool: pool,
      deliveredByUserId: actor.userId,
    })
    .returning({ id: kitDelivery.id });
  const where = WHERE_LABEL[context];
  await writeAudit(tx, actor, {
    action: "KIT_DELIVERED",
    entityType: "kit_delivery",
    entityId: delivery!.id,
    summary:
      kitType === "EMPLOYEE"
        ? `${group.category === "COURTESY" ? "Kit da cortesia" : "Kit de colaborador(a)"} entregue${where} a ${group.person.fullName}.`
        : `Kit do convidado ${beneficiary.fullName} entregue${where} (convidado(a) de ${group.person.fullName}, colaborador(a) do SINDSERM).`,
    after: { employeeId: group.id, kitType, pool, context },
  });
  const available = stock.total - stock.delivered;
  // Estoque dos colaboradores: alerta quando o que resta não dá para quem ainda vai receber. Estoque geral: o limite de alerta.
  const low =
    pool === "EMPLOYEE" ? isLowEmployeeStock(available, await countEmployeesAwaitingKit(tx)) : isLowStock(available, config?.lowStockThreshold ?? 0);
  return {
    deliveryId: delivery!.id,
    kitType,
    beneficiaryName: beneficiary.fullName,
    stock: { pool, ...stock, available, low },
  };
}

/** Entrega manual de um kit do grupo de um(a) funcionário(a) que não saiu na entrada. */
async function deliverEmployeeGroupKit(tx: Tx, actor: StaffActor, employeeId: string, kitType: KitType, now: Date) {
  if (kitType === "MEMBER") {
    throw new DomainError("KIT_NOT_AVAILABLE", "Colaborador(a) do SINDSERM recebe o kit de colaborador(a), não o de professor(a).");
  }
  const group = await lockEmployeeGroupWithPeople(tx, employeeId);
  const config = await getEventConfig(tx);
  if (!config) throw new DomainError("INVALID_STATE", "Estoque não configurado.");
  const availability = employeeKitAvailability(
    employeeKitInput(group, isKitDeadlinePassed(config, now), { guestIndependent: config.kitsAtDesk }),
    kitType,
  );
  if (availability.kind === "DELIVERED") {
    throw new DomainError(
      "ALREADY_DELIVERED",
      `${KIT_TYPE_LABEL[kitType]} já foi entregue em ${formatShortDateTime(availability.delivery.deliveredAt)} por ${availability.delivery.deliveredByName}.`,
    );
  }
  if (availability.kind === "BLOCKED") throw new DomainError("KIT_NOT_AVAILABLE", KIT_BLOCK_MESSAGE[availability.code]);
  if (!(await hasEmployeeStock(tx))) {
    throw new DomainError("OUT_OF_STOCK", "Cadastre o estoque de kits dos colaboradores (Kits e estoque).");
  }
  return recordEmployeeKitDelivery(tx, actor, group, kitType, "MANUAL");
}

/**
 * Entrega manual (reserva): o kit normalmente sai sozinho na entrada. Este
 * caminho serve quando ele não saiu na hora (ex.: estoque tinha acabado e foi
 * reposto). Pelo cadastro de quem convidou:
 * - MEMBER: kit do(a) próprio(a) professor(a), depois da entrada dele(a);
 * - EMPLOYEE: kit do(a) próprio(a) funcionário(a), depois da entrada dele(a);
 * - GUEST: kit do convidado, depois das entradas de quem convidou e do convidado.
 *
 * `leftover`: kit de sobra para quem está na fila do kit (ex.: fim da festa,
 * gente que não veio). Sai do estoque na hora, se houver, e fica na auditoria.
 */
export async function deliverKit(
  actor: Actor,
  input: { personId: string; kitType: KitType; leftover?: boolean },
  now = new Date(),
): Promise<DeliveryResult> {
  assertPermission(actor, "deliverKits");
  try {
    return await withTx(async (tx) => {
      const employeeId = await findEmployeeIdByPerson(tx, input.personId);
      if (employeeId) return deliverEmployeeGroupKit(tx, actor, employeeId, input.kitType, now);
      if (input.kitType === "EMPLOYEE") {
        throw new DomainError("NOT_FOUND", "Esta pessoa não está na lista de colaboradores do SINDSERM.");
      }
      const kitType = input.kitType;
      const own = await findRegistrationIdByMember(tx, input.personId);
      if (!own || !isActiveMember(own.status)) {
        if (await findActiveGuestLink(tx, input.personId)) {
          throw new DomainError(
            "GUEST_CANNOT_RECEIVE_KIT",
            "O kit do convidado sai na entrada dele. Se não saiu, entregue pelo cadastro de quem convidou.",
          );
        }
        if (!own) throw new DomainError("NOT_FOUND", "Esta pessoa não possui inscrição como filiada.");
      }
      // A entrega depende das entradas: trava o grupo todo para não correr em
      // paralelo com o estorno de uma entrada (ordem: inscrição → pessoas).
      const state = await lockRegistrationWithPeople(tx, own!.id);
      const config = await getEventConfig(tx);
      if (!config) throw new DomainError("INVALID_STATE", "Estoque não configurado.");
      const groupKit = kitType as GroupKitType;
      if (input.leftover && state.kitWaitlist[groupKit]) {
        // Sobrou kit: a equipe decide entregar para quem está na fila (sai da fila e o kit sai do estoque).
        await tx
          .update(registration)
          .set(groupKit === "MEMBER" ? { memberKitWaitlistedAt: null } : { guestKitWaitlistedAt: null })
          .where(eq(registration.id, state.id));
        state.kitWaitlist[groupKit] = null;
        await writeAudit(tx, actor, {
          action: "KIT_LEFTOVER_RELEASED",
          entityType: "registration",
          entityId: state.id,
          summary:
            groupKit === "MEMBER"
              ? `Kit de sobra liberado para ${state.member.fullName}, que estava na fila do kit.`
              : `Kit de sobra liberado para o convidado ${state.guest?.fullName ?? ""} (grupo de ${state.member.fullName}), que estava na fila do kit.`,
        });
      }
      // Na mesa dos kits, o kit do convidado não espera quem convidou.
      const availability = kitAvailability(kitInput(state, isKitDeadlinePassed(config, now), { guestIndependent: config.kitsAtDesk }), kitType);
      if (availability.kind === "DELIVERED") {
        throw new DomainError(
          "ALREADY_DELIVERED",
          `${KIT_TYPE_LABEL[kitType]} já foi entregue em ${formatShortDateTime(availability.delivery.deliveredAt)} por ${availability.delivery.deliveredByName}.`,
        );
      }
      if (availability.kind === "BLOCKED") {
        throw new DomainError("KIT_NOT_AVAILABLE", KIT_BLOCK_MESSAGE[availability.code]);
      }
      return recordKitDelivery(tx, actor, state, kitType, config, "MANUAL");
    });
  } catch (error) {
    if (isUniqueViolation(error, "kit_delivery_once_per_type") || isUniqueViolation(error, "kit_delivery_once_per_employee")) {
      throw new DomainError("ALREADY_DELIVERED", `${KIT_TYPE_LABEL[input.kitType]} já foi entregue.`);
    }
    throw error;
  }
}

/** Estorna uma entrega dentro de uma transação já aberta (o kit volta ao estoque de onde saiu). */
export async function cancelDeliveryInTx(tx: Tx, actor: StaffActor, deliveryId: string, reason: string) {
  const [delivery] = await tx.select().from(kitDelivery).where(eq(kitDelivery.id, deliveryId)).for("update");
  if (!delivery || delivery.cancelledAt) throw new DomainError("NOT_FOUND", "Entrega não encontrada.");
  const config = await getEventConfig(tx);
  if (!config) throw new DomainError("INVALID_STATE", "Estoque não configurado.");
  await tx
    .update(kitDelivery)
    .set({ cancelledAt: new Date(), cancelledByUserId: actor.userId, cancelReason: reason })
    .where(eq(kitDelivery.id, delivery.id));
  // Kits do grupo de funcionário(a) voltam para o estoque dos funcionários; os da gordura, para a gordura.
  const pool = delivery.stockPool === "EXTRA" ? "EXTRA" : stockPoolFor(config.stockMode, delivery.kitType, Boolean(delivery.employeeId));
  await tx
    .update(kitStock)
    .set({ delivered: sql`${kitStock.delivered} - 1` })
    .where(and(eq(kitStock.pool, pool), gt(kitStock.delivered, 0)));
  return delivery;
}

/** Correção administrativa: estorna uma entrega e devolve o kit ao estoque. */
export async function cancelKitDelivery(actor: Actor, input: { deliveryId: string; justification: string }) {
  assertPermission(actor, "adminCorrections");
  const justification = justificationField.parse(input.justification);
  return withTx(async (tx) => {
    const [target] = await tx
      .select({ registrationId: kitDelivery.registrationId, employeeId: kitDelivery.employeeId })
      .from(kitDelivery)
      .where(eq(kitDelivery.id, input.deliveryId));
    if (!target) throw new DomainError("NOT_FOUND", "Entrega não encontrada.");
    // Ordem de bloqueio: grupo (inscrição ou funcionário) → pessoas → entrega.
    const ownerName = target.registrationId
      ? (await lockRegistration(tx, target.registrationId)).member.fullName
      : (await lockEmployeeGroupWithPeople(tx, target.employeeId!)).person.fullName;
    const delivery = await cancelDeliveryInTx(tx, actor, input.deliveryId, justification);
    await writeAudit(tx, actor, {
      action: "KIT_DELIVERY_CANCELLED",
      entityType: "kit_delivery",
      entityId: delivery.id,
      summary: `${KIT_TYPE_LABEL[delivery.kitType]} de ${ownerName} estornado: ${justification}`,
      before: { deliveredAt: delivery.deliveredAt.toISOString(), kitType: delivery.kitType },
    });
  });
}
