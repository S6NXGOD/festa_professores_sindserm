import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { checkIn, person, voucher } from "@/server/db/schema";
import { isKitDeadlinePassed } from "@/domain/kit-deadline";
import { ENTRY_BLOCK_MESSAGE, ENTRY_KIT_MESSAGE } from "@/domain/labels";
import {
  decideEntry,
  employeeKitAvailability,
  type EmployeeKitInput,
  kitAvailability,
  type KitRegistrationInput,
} from "@/domain/rules";
import { justificationField } from "@/domain/schemas";
import type {
  CheckInInfo,
  CheckInMethod,
  DeliveryInfo,
  EmployeeKitType,
  GroupKitType,
  KitType,
  ParticipantRole,
} from "@/domain/types";
import { type Actor, assertPermission, type StaffActor } from "./actor";
import { writeAudit } from "./audit";
import { DomainError, isUniqueViolation } from "./errors";
import {
  cancelDeliveryInTx,
  employeeKitInput,
  hasEmployeeStock,
  kitInput,
  recordEmployeeKitDelivery,
  recordKitDelivery,
} from "./kits";
import { lockEmployeeRows, lockRegistrationRow } from "./locks";
import { type EventConfig, getEventConfig } from "./settings";
import {
  type EmployeeGroupState,
  loadActiveCheckIns,
  loadPersonState,
  type PersonState,
  type RegistrationState,
} from "./state";
import { withTx } from "./tx";

export async function lockPersonState(tx: Tx, personId: string): Promise<PersonState> {
  const [row] = await tx.select({ id: person.id }).from(person).where(eq(person.id, personId)).for("update");
  if (!row) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
  const state = await loadPersonState(tx, personId);
  if (!state) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
  return state;
}

/**
 * Trava os grupos da pessoa (inscrições e funcionários) e depois a pessoa, na
 * mesma ordem da entrega de kits (grupo → pessoa), para a entrada e o kit
 * nunca correrem em paralelo com outra operação do grupo.
 */
async function lockPersonWithGroups(tx: Tx, personId: string): Promise<PersonState> {
  const preview = await loadPersonState(tx, personId);
  if (!preview) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
  const registrationIds = [preview.ownRegistration?.id, preview.guestOf?.host.id]
    .filter((id): id is string => Boolean(id))
    .sort();
  for (const id of registrationIds) await lockRegistrationRow(tx, id);
  await lockEmployeeRows(
    tx,
    [preview.employee?.id, preview.guestOfEmployee?.host.id].filter((id): id is string => Boolean(id)),
  );
  return lockPersonState(tx, personId);
}

export function entryDecisionFor(state: PersonState) {
  return decideEntry({
    checkIn: state.checkIn,
    ownStatus: state.ownRegistration?.status ?? null,
    hostStatus: state.guestOf?.host.status ?? null,
    employee: state.employee ? { active: state.employee.active } : null,
    employeeHost: state.guestOfEmployee ? { active: state.guestOfEmployee.host.active } : null,
  });
}

/** Nome de quem convidou a pessoa (professor(a) ou funcionário(a)), se ela é convidada. */
export function hostNameOf(state: PersonState): string | null {
  return state.guestOf?.host.member.fullName ?? state.guestOfEmployee?.host.person.fullName ?? null;
}

/** O que aconteceu com um kit na hora da entrada. */
export type EntryKitResult =
  | { kind: "DELIVERED"; kitType: KitType; beneficiaryName: string; available: number; low: boolean }
  /** Kit do convidado que chegou antes do(a) professor(a): sai quando ele(a) chegar. */
  | { kind: "WAITING"; message: string }
  | { kind: "NONE"; message: string };

export type CheckInResult =
  | {
      outcome: "CHECKED_IN";
      checkIn: CheckInInfo;
      /** Kit da própria pessoa. */
      kit: EntryKitResult;
      /** Na chegada do(a) professor(a): kit do convidado que já tinha entrado (null se não se aplica). */
      guestKit: EntryKitResult | null;
    }
  | { outcome: "ALREADY"; checkIn: CheckInInfo };

/** Entrega um kit do grupo agora, se houver direito (a entrada já foi gravada nesta transação). */
async function deliverNow(
  tx: Tx,
  actor: StaffActor,
  group: RegistrationState,
  kitType: GroupKitType,
  config: EventConfig,
  input: KitRegistrationInput,
): Promise<EntryKitResult> {
  const availability = kitAvailability(input, kitType);
  if (availability.kind === "DELIVERED") {
    return { kind: "NONE", message: kitType === "GUEST" ? ENTRY_KIT_MESSAGE.GUEST_KIT_USED : ENTRY_KIT_MESSAGE.ALREADY };
  }
  if (availability.kind === "BLOCKED") {
    return availability.code === "HOST_NOT_CHECKED_IN"
      ? { kind: "WAITING", message: `Sai quando ${group.member.fullName} chegar.` }
      : { kind: "NONE", message: ENTRY_KIT_MESSAGE[availability.code] };
  }
  try {
    const delivered = await recordKitDelivery(tx, actor, group, kitType, config, "ENTRY");
    return {
      kind: "DELIVERED",
      kitType,
      beneficiaryName: delivered.beneficiaryName,
      available: delivered.stock.available,
      low: delivered.stock.low,
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === "OUT_OF_STOCK") {
      return { kind: "NONE", message: ENTRY_KIT_MESSAGE.OUT_OF_STOCK };
    }
    throw error;
  }
}

/** Entrega agora um kit do grupo do(a) funcionário(a), se houver direito (a entrada já foi gravada nesta transação). */
async function deliverEmployeeNow(
  tx: Tx,
  actor: StaffActor,
  group: EmployeeGroupState,
  kitType: EmployeeKitType,
  input: EmployeeKitInput,
): Promise<EntryKitResult> {
  const availability = employeeKitAvailability(input, kitType);
  if (availability.kind === "DELIVERED") {
    return { kind: "NONE", message: kitType === "GUEST" ? ENTRY_KIT_MESSAGE.GUEST_KIT_USED : ENTRY_KIT_MESSAGE.ALREADY };
  }
  if (availability.kind === "BLOCKED") {
    return availability.code === "HOST_NOT_CHECKED_IN"
      ? { kind: "WAITING", message: `Sai quando ${group.person.fullName} chegar.` }
      : { kind: "NONE", message: ENTRY_KIT_MESSAGE[availability.code] };
  }
  if (!(await hasEmployeeStock(tx))) return { kind: "NONE", message: ENTRY_KIT_MESSAGE.NO_EMPLOYEE_STOCK };
  try {
    const delivered = await recordEmployeeKitDelivery(tx, actor, group, kitType, "ENTRY");
    return {
      kind: "DELIVERED",
      kitType,
      beneficiaryName: delivered.beneficiaryName,
      available: delivered.stock.available,
      low: delivered.stock.low,
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === "OUT_OF_STOCK") return { kind: "NONE", message: ENTRY_KIT_MESSAGE.OUT_OF_STOCK };
    throw error;
  }
}

/**
 * Grupo de um(a) funcionário(a) do SINDSERM, com a mesma regra dos
 * professoras e professores: o kit dele(a) sai na entrada dele(a); o do convidado, quando os
 * dois já chegaram. Os dois saem do estoque dos funcionários.
 */
async function deliverEmployeeKitsOnEntry(
  tx: Tx,
  actor: StaffActor,
  group: EmployeeGroupState,
  arriving: "EMPLOYEE" | "GUEST",
  now: Date,
): Promise<{ kit: EntryKitResult; guestKit: EntryKitResult | null }> {
  const config = await getEventConfig(tx);
  if (!config) return { kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.NO_STOCK_CONFIG }, guestKit: null };
  const deadlinePassed = isKitDeadlinePassed(config, now);
  if (arriving === "GUEST") {
    const input = employeeKitInput(group, deadlinePassed, { guestCheckedIn: true });
    return { kit: await deliverEmployeeNow(tx, actor, group, "GUEST", input), guestKit: null };
  }
  const input = employeeKitInput(group, deadlinePassed, { employeeCheckedIn: true });
  const kit = await deliverEmployeeNow(tx, actor, group, "EMPLOYEE", input);
  // O convidado chegou antes e está esperando: o kit dele sai agora.
  const guestWaiting = Boolean(group.guest?.checkIn) && !group.deliveries.GUEST;
  const guestKit = guestWaiting ? await deliverEmployeeNow(tx, actor, group, "GUEST", input) : null;
  return { kit, guestKit };
}

/**
 * Os kits saem junto com as entradas. Quem convidou (professor(a) ou
 * funcionário(a)) recebe o próprio kit ao entrar. O kit do convidado só sai
 * quando os dois já chegaram: na entrada do convidado ou, se ele chegou antes,
 * na chegada de quem convidou (que leva o kit para ele). Sem direito, fora do
 * horário ou sem estoque, a pessoa entra do mesmo jeito e a tela avisa.
 */
async function deliverKitsOnEntry(
  tx: Tx,
  actor: StaffActor,
  state: PersonState,
  role: ParticipantRole,
  now: Date,
): Promise<{ kit: EntryKitResult; guestKit: EntryKitResult | null }> {
  if (role === "EMPLOYEE") return deliverEmployeeKitsOnEntry(tx, actor, state.employee!, "EMPLOYEE", now);
  if (role === "GUEST" && !state.guestOf && state.guestOfEmployee) {
    const group = state.guestOfEmployee.host;
    if (group.guest?.personId !== state.person.id) {
      return { kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.NO_GUEST }, guestKit: null };
    }
    return deliverEmployeeKitsOnEntry(tx, actor, group, "GUEST", now);
  }
  const group = role === "MEMBER" ? state.ownRegistration : state.guestOf?.host;
  if (!group) return { kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.NOT_TEACHER }, guestKit: null };
  if (role === "GUEST" && group.guest?.personId !== state.person.id) {
    return { kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.NO_GUEST }, guestKit: null };
  }
  const config = await getEventConfig(tx);
  if (!config) return { kit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.NO_STOCK_CONFIG }, guestKit: null };
  const deadlinePassed = isKitDeadlinePassed(config, now);

  if (role === "GUEST") {
    const kit = await deliverNow(tx, actor, group, "GUEST", config, kitInput(group, deadlinePassed, { guestCheckedIn: true }));
    return { kit, guestKit: null };
  }
  const input = kitInput(group, deadlinePassed, { memberCheckedIn: true });
  const kit = await deliverNow(tx, actor, group, "MEMBER", config, input);
  // O convidado chegou antes e está esperando: o kit dele sai agora.
  const guestWaiting = Boolean(group.guest?.checkIn) && !group.deliveries.GUEST;
  const guestKit = guestWaiting ? await deliverNow(tx, actor, group, "GUEST", config, input) : null;
  return { kit, guestKit };
}

/**
 * Registra a entrada (e entrega o kit, quando houver direito). A leitura do QR
 * não registra nada: esta função só é chamada quando o operador confirma.
 * Entrada é única por pessoa.
 */
export async function registerCheckIn(
  actor: Actor,
  input: { personId: string; method: CheckInMethod; voucherId?: string | null },
  now = new Date(),
): Promise<CheckInResult> {
  assertPermission(actor, "checkIn");
  try {
    return await withTx(async (tx): Promise<CheckInResult> => {
      const state = await lockPersonWithGroups(tx, input.personId);
      const decision = entryDecisionFor(state);
      if (decision.kind === "ALREADY_IN") return { outcome: "ALREADY", checkIn: decision.checkIn };
      if (decision.kind === "BLOCKED") {
        throw new DomainError("ENTRY_BLOCKED", ENTRY_BLOCK_MESSAGE[decision.code].title);
      }
      if (input.voucherId) {
        const [v] = await tx
          .select({ personId: voucher.personId, revokedAt: voucher.revokedAt })
          .from(voucher)
          .where(eq(voucher.id, input.voucherId));
        if (!v || v.personId !== input.personId || v.revokedAt) {
          throw new DomainError("INVALID_STATE", "QR Code inválido ou cancelado.");
        }
      }
      const role = decision.role;
      const hostName = hostNameOf(state);
      const [created] = await tx
        .insert(checkIn)
        .values({
          personId: input.personId,
          role,
          registrationId: role === "MEMBER" ? state.ownRegistration!.id : role === "GUEST" ? (state.guestOf?.host.id ?? null) : null,
          guestLinkId: role === "GUEST" ? (state.guestOf?.guestLinkId ?? state.guestOfEmployee!.guestLinkId) : null,
          employeeId: role === "EMPLOYEE" ? state.employee!.id : null,
          voucherId: input.voucherId ?? null,
          method: input.method,
          checkedInByUserId: actor.userId,
        })
        .returning({ id: checkIn.id, checkedInAt: checkIn.checkedInAt });
      const { kit, guestKit } = await deliverKitsOnEntry(tx, actor, state, role, now);
      const kitSummary =
        kit.kind === "DELIVERED"
          ? " com kit entregue."
          : kit.kind === "WAITING"
            ? `. O kit fica para a chegada de ${hostName ?? "quem convidou"}.`
            : `. ${kit.message}`;
      const who =
        role === "MEMBER"
          ? "filiado(a)"
          : role === "GUEST"
            ? `convidado(a) de ${hostName ?? "—"}${state.guestOfEmployee ? ", funcionário(a) do SINDSERM" : ""}`
            : "funcionário(a) do SINDSERM";
      await writeAudit(tx, actor, {
        action: "CHECKIN_REGISTERED",
        entityType: "person",
        entityId: input.personId,
        summary:
          `Entrada de ${state.person.fullName} (${who})` +
          kitSummary +
          (guestKit?.kind === "DELIVERED" ? ` Kit do convidado ${guestKit.beneficiaryName} entregue junto.` : ""),
        after: {
          method: input.method,
          role: decision.role,
          kit: kit.kind === "DELIVERED" ? kit.kitType : null,
          guestKit: guestKit?.kind === "DELIVERED" ? "GUEST" : null,
        },
      });
      return {
        outcome: "CHECKED_IN",
        checkIn: {
          id: created!.id,
          checkedInAt: created!.checkedInAt,
          checkedInByName: actor.name,
          method: input.method,
          role: decision.role,
        },
        kit,
        guestKit,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error, "check_in_one_active_per_person")) {
      const existing = (await withTx((tx) => loadActiveCheckIns(tx, [input.personId]))).get(input.personId);
      if (existing) return { outcome: "ALREADY", checkIn: existing };
    }
    throw error;
  }
}

/**
 * Correção administrativa: estorna uma entrada registrada por engano. Os kits
 * que dependiam dessa entrada voltam ao estoque na mesma operação: o da própria
 * pessoa e, na entrada de quem convidou (professor(a) ou funcionário(a)),
 * também o do convidado (que só sai depois dessa chegada).
 */
export async function cancelCheckIn(actor: Actor, input: { personId: string; justification: string }) {
  assertPermission(actor, "adminCorrections");
  const justification = justificationField.parse(input.justification);
  return withTx(async (tx) => {
    const state = await lockPersonWithGroups(tx, input.personId);
    if (!state.checkIn) throw new DomainError("INVALID_STATE", "Não há entrada registrada para esta pessoa.");

    const kits: DeliveryInfo[] = [];
    if (state.checkIn.role === "MEMBER" && state.ownRegistration) {
      const { MEMBER, GUEST } = state.ownRegistration.deliveries;
      if (MEMBER) kits.push(MEMBER);
      if (GUEST) kits.push(GUEST);
    }
    const hostGuestKit = state.guestOf?.host.deliveries.GUEST ?? state.guestOfEmployee?.host.deliveries.GUEST;
    if (hostGuestKit && hostGuestKit.beneficiaryPersonId === state.person.id) kits.push(hostGuestKit);
    if (state.checkIn.role === "EMPLOYEE" && state.employee) {
      const { EMPLOYEE, GUEST } = state.employee.deliveries;
      if (EMPLOYEE) kits.push(EMPLOYEE);
      if (GUEST) kits.push(GUEST);
    }
    for (const kit of kits) await cancelDeliveryInTx(tx, actor, kit.id, `Entrada estornada: ${justification}`);

    await tx
      .update(checkIn)
      .set({ cancelledAt: new Date(), cancelledByUserId: actor.userId, cancelReason: justification })
      .where(and(eq(checkIn.personId, input.personId), isNull(checkIn.cancelledAt)));
    const returned = kits.length === 0 ? "" : kits.length === 1 ? " (o kit voltou ao estoque)" : ` (os ${kits.length} kits voltaram ao estoque)`;
    await writeAudit(tx, actor, {
      action: "CHECKIN_CANCELLED",
      entityType: "person",
      entityId: input.personId,
      summary: `Entrada de ${state.person.fullName} estornada${returned}: ${justification}`,
      before: {
        checkedInAt: state.checkIn.checkedInAt.toISOString(),
        by: state.checkIn.checkedInByName,
        kitsReturned: kits.map((kit) => kit.kitType),
      },
    });
    return { kitsReturned: kits.length };
  });
}
