import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { kitDelivery, kitStock } from "@/server/db/schema";
import {
  employeeKitAvailability,
  type EmployeeKitInput,
  isActiveMember,
  isLowEmployeeStock,
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

/** O estoque dos funcionários existe e tem kits cadastrados? */
export async function hasEmployeeStock(tx: Tx): Promise<boolean> {
  const [row] = await tx.select({ total: kitStock.total }).from(kitStock).where(eq(kitStock.pool, "EMPLOYEE")).limit(1);
  return Boolean(row && row.total > 0);
}

/**
 * Grava a entrega: baixa o estoque (sem nunca ficar negativo), registra o kit
 * no grupo do(a) professor(a) e audita. Supõe a inscrição já travada e a
 * disponibilidade já conferida. Estoque zerado: DomainError OUT_OF_STOCK.
 */
export async function recordKitDelivery(
  tx: Tx,
  actor: StaffActor,
  state: RegistrationState,
  kitType: GroupKitType,
  config: EventConfig,
  context: "ENTRY" | "MANUAL",
): Promise<DeliveryResult> {
  const pool = stockPoolFor(config.stockMode, kitType);
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

  const where = context === "ENTRY" ? " na entrada" : "";
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
  return {
    deliveryId: delivery!.id,
    kitType,
    beneficiaryName: beneficiary.fullName,
    stock: { pool, ...stock, available, low: isLowStock(available, config.lowStockThreshold) },
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
  context: "ENTRY" | "MANUAL",
): Promise<DeliveryResult> {
  const stock = await takeFromStock(tx, "EMPLOYEE");
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
      stockPool: "EMPLOYEE",
      deliveredByUserId: actor.userId,
    })
    .returning({ id: kitDelivery.id });
  const where = context === "ENTRY" ? " na entrada" : "";
  await writeAudit(tx, actor, {
    action: "KIT_DELIVERED",
    entityType: "kit_delivery",
    entityId: delivery!.id,
    summary:
      kitType === "EMPLOYEE"
        ? `Kit de colaborador(a) entregue${where} a ${group.person.fullName}.`
        : `Kit do convidado ${beneficiary.fullName} entregue${where} (convidado(a) de ${group.person.fullName}, colaborador(a) do SINDSERM).`,
    after: { employeeId: group.id, kitType, pool: "EMPLOYEE", context },
  });
  const available = stock.total - stock.delivered;
  // Alerta só quando o que resta não dá para quem ainda vai receber (funcionários e convidados).
  const low = isLowEmployeeStock(available, await countEmployeesAwaitingKit(tx));
  return {
    deliveryId: delivery!.id,
    kitType,
    beneficiaryName: beneficiary.fullName,
    stock: { pool: "EMPLOYEE", ...stock, available, low },
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
  const availability = employeeKitAvailability(employeeKitInput(group, isKitDeadlinePassed(config, now)), kitType);
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
 */
export async function deliverKit(
  actor: Actor,
  input: { personId: string; kitType: KitType },
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
      const availability = kitAvailability(kitInput(state, isKitDeadlinePassed(config, now)), kitType);
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
  // Kits do grupo de funcionário(a) voltam para o estoque dos funcionários.
  const pool = stockPoolFor(config.stockMode, delivery.kitType, Boolean(delivery.employeeId));
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
