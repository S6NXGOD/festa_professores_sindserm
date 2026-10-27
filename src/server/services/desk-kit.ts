import "server-only";
import { isKitDeadlinePassed } from "@/domain/kit-deadline";
import { T } from "@/domain/edition";
import { kitPlanSchema } from "@/domain/kit-plan";
import { ENTRY_KIT_MESSAGE, sharedKitMessage } from "@/domain/labels";
import {
  employeeKitAvailability,
  employeeStockPool,
  isActiveMember,
  kitAvailability,
  type KitAvailability,
  type KitBlockCode,
} from "@/domain/rules";
import type { KitType, ParticipantRole, StockPool } from "@/domain/types";
import { employeeKitInput, kitInput, registrationKitPool } from "./kits";
import type { EventConfig, StockOverview } from "./settings";
import type { PersonState } from "./state";

/*
 * Mesa dos kits: a segurança registra a entrada e a pessoa vai à mesa buscar o
 * kit. A mesa vê se ela passou pela entrada, confere quem é e entrega o kit da
 * caixa certa (oficial ou gordura). Cada pessoa pega o próprio kit: o convidado
 * não espera quem convidou (decisão da organização para a mesa).
 */

export type DeskKitCode = KitBlockCode | "OUT_OF_STOCK" | "NO_EMPLOYEE_STOCK" | "OTHER_GUEST" | "NO_KIT";

export type DeskKit =
  /** Ainda não passou pela entrada: a mesa manda para a segurança. */
  | { kind: "NOT_ENTERED" }
  /** Pode entregar agora; `extra` = da caixa da gordura (inscrição na hora). */
  | { kind: "READY"; kitType: KitType; pool: StockPool; extra: boolean; minor: boolean }
  | { kind: "DELIVERED"; at: Date; byName: string; extra: boolean }
  /** `leftover`: na fila do kit antes do horário; a equipe pode entregar um kit de sobra. */
  | { kind: "BLOCKED"; code: DeskKitCode; message: string; leftover: boolean };

/** O que a mesa lê quando o kit não sai (escrito para quem está na mesa, não para a portaria). */
export const DESK_BLOCK_MESSAGE: Record<DeskKitCode, string> = {
  NOT_ACTIVE_MEMBER: "A filiação ainda não foi confirmada: mande ao Atendimento.",
  NOT_TEACHER: `Não é ${T.person}: entra na festa, mas não tem kit de consumação.`,
  MEMBER_NOT_CHECKED_IN: "Ainda não passou pela entrada.",
  NO_GUEST: "Sem kit de convidado neste grupo.",
  HOST_NOT_CHECKED_IN: "O kit do convidado sai depois que quem convidou chegar (kits na portaria).",
  GUEST_NOT_CHECKED_IN: "Ainda não passou pela entrada.",
  MEMBER_GOT_GUEST_KIT: "Já recebeu um kit quando entrou como convidado(a): uma pessoa, um kit.",
  EMPLOYEE_REMOVED: "Fora da lista de colaboradores: sem kit.",
  EMPLOYEE_NOT_CHECKED_IN: "Ainda não passou pela entrada.",
  WITHOUT_KIT: "Cadastro sem kit de consumação (combinado com a organização).",
  KIT_WAITLIST: "Na fila do kit: se inscreveu depois que os kits acabaram. As sobras saem depois do horário dos kits guardados.",
  SHARED_KIT: "Sem kit próprio: o kit de quem convidou é para os dois (sai para quem convidou).",
  OUT_OF_STOCK: "O estoque acabou: não há kit para entregar agora.",
  NO_EMPLOYEE_STOCK: ENTRY_KIT_MESSAGE.NO_EMPLOYEE_STOCK,
  OTHER_GUEST: "O kit de convidado deste grupo já saiu para outra pessoa.",
  NO_KIT: "Sem kit de consumação.",
};

/** A montagem tem kit próprio para menor de 18 (ex.: sem bebida alcoólica). */
export function hasMinorKit(config: Pick<EventConfig, "kitPlan"> | null): boolean {
  const parsed = kitPlanSchema.safeParse(config?.kitPlan ?? null);
  return parsed.success && parsed.data.minor !== null;
}

/** Inscrição feita na hora: o kit da pessoa sai da gordura (o voucher e as telas mostram o selo). */
export function walkInOf(state: PersonState): boolean {
  if (state.ownRegistration?.kitExtra.MEMBER) return true;
  const host = state.guestOf?.host;
  return Boolean(host && host.guest?.personId === state.person.id && host.kitExtra.GUEST);
}

type DeskConfig = Pick<EventConfig, "stockMode" | "kitsAtDesk" | "kitPlan" | "eventDate" | "startTime" | "kitDeadlineTime">;

/** De qual grupo sai o kit da pessoa, pelo cadastro de agora (a mesma ordem da entrada). */
export type DeskRole = "EMPLOYEE" | "MEMBER" | "GUEST_OF_MEMBER" | "GUEST_OF_EMPLOYEE";

export function deskRoleOf(state: PersonState): DeskRole | null {
  if (state.employee?.active) return "EMPLOYEE";
  if (state.ownRegistration && isActiveMember(state.ownRegistration.status)) return "MEMBER";
  if (state.guestOf) return "GUEST_OF_MEMBER";
  if (state.guestOfEmployee) return "GUEST_OF_EMPLOYEE";
  if (state.ownRegistration) return "MEMBER";
  if (state.employee) return "EMPLOYEE";
  return null;
}

/**
 * O kit da pessoa na mesa. `enteringAs`: a entrada está sendo registrada agora
 * (o estado ainda não tem a entrada). Com o saldo (`stock`), avisa quando a
 * caixa acabou.
 */
export function evaluateDeskKit(
  state: PersonState,
  config: DeskConfig | null,
  now: Date,
  stock: StockOverview | null,
  options: { enteringAs?: ParticipantRole | null } = {},
): DeskKit {
  if (!state.checkIn && !options.enteringAs) return { kind: "NOT_ENTERED" };
  // O papel de agora (ex.: convidado que virou filiado depois de entrar pega o kit de filiado).
  const role = deskRoleOf(state);
  const deadlinePassed = isKitDeadlinePassed(config, now);
  const guestIndependent = Boolean(config?.kitsAtDesk);
  const minor = state.person.isMinor && hasMinorKit(config);
  const blocked = (code: DeskKitCode, message = DESK_BLOCK_MESSAGE[code]): DeskKit => ({
    kind: "BLOCKED",
    code,
    message,
    leftover: code === "KIT_WAITLIST" && !deadlinePassed,
  });

  const decide = (availability: KitAvailability, kitType: KitType, pool: StockPool, extra: boolean, employeeGroup: boolean): DeskKit => {
    if (availability.kind === "DELIVERED") {
      if (availability.delivery.beneficiaryPersonId !== state.person.id) {
        return blocked("OTHER_GUEST", `O kit de convidado deste grupo já saiu para ${availability.delivery.beneficiaryName}.`);
      }
      return { kind: "DELIVERED", at: availability.delivery.deliveredAt, byName: availability.delivery.deliveredByName, extra };
    }
    if (availability.kind === "BLOCKED") return blocked(availability.code);
    if (stock) {
      const view = pool === "EXTRA" ? stock.extra : stock.pools.find((p) => p.pool === pool);
      if (employeeGroup && !view) return blocked("NO_EMPLOYEE_STOCK");
      if (!view || view.available <= 0) {
        return blocked("OUT_OF_STOCK", pool === "EXTRA" ? "A gordura acabou: não há kit da gordura para entregar agora." : DESK_BLOCK_MESSAGE.OUT_OF_STOCK);
      }
    }
    return { kind: "READY", kitType, pool, extra, minor };
  };

  const employeePool: StockPool = config ? employeeStockPool(config.stockMode) : "EMPLOYEE";
  if (!role) return blocked("NO_KIT");
  if (role === "EMPLOYEE") {
    const group = state.employee;
    if (!group) return blocked("NO_KIT");
    const input = employeeKitInput(group, deadlinePassed, { employeeCheckedIn: true, guestIndependent });
    return decide(employeeKitAvailability(input, "EMPLOYEE"), "EMPLOYEE", employeePool, false, true);
  }
  if (role === "GUEST_OF_MEMBER" || role === "GUEST_OF_EMPLOYEE") {
    if (role === "GUEST_OF_MEMBER" && state.guestOf) {
      const group = state.guestOf.host;
      if (group.guest?.personId !== state.person.id) return blocked("NO_KIT");
      const input = kitInput(group, deadlinePassed, { guestCheckedIn: true, guestIndependent });
      const pool = config ? registrationKitPool(group, "GUEST", config) : "ALL";
      const availability = kitAvailability(input, "GUEST");
      // Kit dividido: o convidado não tem kit próprio; o de quem convidou é para os dois.
      if (availability.kind === "BLOCKED" && availability.code === "SHARED_KIT") {
        return blocked("SHARED_KIT", `${sharedKitMessage(group.member.fullName)} Ele sai para ${group.member.fullName}.`);
      }
      return decide(availability, "GUEST", pool, Boolean(group.kitExtra.GUEST), false);
    }
    if (state.guestOfEmployee) {
      const group = state.guestOfEmployee.host;
      if (group.guest?.personId !== state.person.id) return blocked("NO_KIT");
      const input = employeeKitInput(group, deadlinePassed, { guestCheckedIn: true, guestIndependent });
      const availability = employeeKitAvailability(input, "GUEST");
      // Kit dividido: o convidado do(a) colaborador(a) também não tem kit próprio.
      if (availability.kind === "BLOCKED" && availability.code === "SHARED_KIT") {
        return blocked("SHARED_KIT", `${sharedKitMessage(group.person.fullName)} Ele sai para ${group.person.fullName}.`);
      }
      return decide(availability, "GUEST", employeePool, false, true);
    }
    return blocked("NO_KIT", "Sem kit: o vínculo de convidado não está ativo.");
  }
  const group = state.ownRegistration;
  if (!group) return blocked("NO_KIT");
  const input = kitInput(group, deadlinePassed, { memberCheckedIn: true, guestIndependent });
  const pool = config ? registrationKitPool(group, "MEMBER", config) : "ALL";
  return decide(kitAvailability(input, "MEMBER"), "MEMBER", pool, Boolean(group.kitExtra.MEMBER), false);
}
