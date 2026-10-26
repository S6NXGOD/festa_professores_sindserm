/**
 * Regras de negócio puras (sem banco). São usadas pelos serviços para validar
 * operações dentro de transações e pela interface para exibir estados.
 */
import type {
  AffiliationStatus,
  CheckInInfo,
  Deliveries,
  DeliveryInfo,
  EmployeeDeliveries,
  EmployeeKitType,
  GroupKitType,
  KitType,
  ParticipantRole,
  StockMode,
  StockPool,
} from "./types";

/** Filiação válida para entrada como filiado(a). */
export function isActiveMember(status: AffiliationStatus | null | undefined): boolean {
  return status === "CONFIRMED" || status === "JOINED_AT_EVENT";
}

// ---------------------------------------------------------------------------
// Entrada (check-in)
// ---------------------------------------------------------------------------

export type EntryBlockCode =
  | "MEMBER_PENDING"
  | "MEMBER_AWAITING_SIGNATURE"
  | "MEMBER_REJECTED"
  | "HOST_PENDING"
  | "HOST_REJECTED"
  | "HOST_EMPLOYEE_REMOVED"
  | "EMPLOYEE_REMOVED"
  | "NO_ACTIVE_REGISTRATION";

export type EntryDecision =
  | { kind: "ALREADY_IN"; checkIn: CheckInInfo }
  | { kind: "ALLOWED"; role: ParticipantRole }
  | { kind: "BLOCKED"; code: EntryBlockCode };

export interface EntryInput {
  checkIn: CheckInInfo | null;
  /** Status da inscrição da própria pessoa como filiada, se houver. */
  ownStatus: AffiliationStatus | null;
  /** Status do(a) professor(a) responsável, quando a pessoa é convidada ativa de um(a) professor(a). */
  hostStatus: AffiliationStatus | null;
  /** Cadastro como funcionário(a) do SINDSERM, se houver (removido = inativo). */
  employee?: { active: boolean } | null;
  /** Funcionário(a) que convidou, quando a pessoa é convidada ativa de um(a) funcionário(a). */
  employeeHost?: { active: boolean } | null;
}

export function decideEntry({ checkIn, ownStatus, hostStatus, employee, employeeHost }: EntryInput): EntryDecision {
  if (checkIn) return { kind: "ALREADY_IN", checkIn };
  // Funcionário(a) do SINDSERM entra pelo voucher dele(a) (ninguém é funcionário e filiado ao mesmo tempo).
  if (employee?.active) return { kind: "ALLOWED", role: "EMPLOYEE" };
  if (isActiveMember(ownStatus)) return { kind: "ALLOWED", role: "MEMBER" };
  if (hostStatus) {
    // Não filiados participam somente como convidados de um filiado válido (ou de um funcionário).
    if (isActiveMember(hostStatus)) return { kind: "ALLOWED", role: "GUEST" };
    return { kind: "BLOCKED", code: hostStatus === "REJECTED" ? "HOST_REJECTED" : "HOST_PENDING" };
  }
  if (employeeHost) {
    return employeeHost.active ? { kind: "ALLOWED", role: "GUEST" } : { kind: "BLOCKED", code: "HOST_EMPLOYEE_REMOVED" };
  }
  if (ownStatus === "PENDING") return { kind: "BLOCKED", code: "MEMBER_PENDING" };
  if (ownStatus === "AWAITING_SIGNATURE") return { kind: "BLOCKED", code: "MEMBER_AWAITING_SIGNATURE" };
  if (ownStatus === "REJECTED") return { kind: "BLOCKED", code: "MEMBER_REJECTED" };
  if (employee) return { kind: "BLOCKED", code: "EMPLOYEE_REMOVED" };
  return { kind: "BLOCKED", code: "NO_ACTIVE_REGISTRATION" };
}

// ---------------------------------------------------------------------------
// Kits de consumação
// ---------------------------------------------------------------------------

export type KitBlockCode =
  | "NOT_ACTIVE_MEMBER"
  | "NOT_TEACHER"
  | "MEMBER_NOT_CHECKED_IN"
  | "NO_GUEST"
  | "HOST_NOT_CHECKED_IN"
  | "GUEST_NOT_CHECKED_IN"
  | "MEMBER_GOT_GUEST_KIT"
  | "EMPLOYEE_REMOVED"
  | "EMPLOYEE_NOT_CHECKED_IN"
  /** Cortesia ou convidado(a) de colaborador(a) cadastrado(a) sem kit de consumação. */
  | "WITHOUT_KIT"
  /** Inscrição feita quando os kits já estavam todos com os inscritos: o kit está na fila. */
  | "KIT_WAITLIST"
  /** Festa de kit dividido: o convidado não tem kit próprio, o do(a) filiado(a) é para os dois. */
  | "SHARED_KIT";

export type KitAvailability =
  | { kind: "DELIVERED"; delivery: DeliveryInfo }
  | { kind: "AVAILABLE" }
  | { kind: "BLOCKED"; code: KitBlockCode };

export interface KitRegistrationInput {
  status: AffiliationStatus;
  isTeacher: boolean;
  memberCheckedIn: boolean;
  hasGuest: boolean;
  /** O convidado já entrou na festa. */
  guestCheckedIn: boolean;
  deliveries: Deliveries;
  /**
   * Passou o horário até quando os kits ficam guardados (decisão da organização):
   * a fila do kit não espera mais — as sobras saem para quem entrar, enquanto houver.
   */
  deadlinePassed: boolean;
  /**
   * O(a) filiado(a) já recebeu um kit quando era convidado(a) de outra pessoa
   * (convidado que se filiou na festa): uma pessoa, um kit.
   */
  memberReceivedGuestKit?: boolean;
  /** Kits na fila (inscrição depois que os kits do estoque acabaram): só saem quando vagar kit. */
  waitlisted?: Partial<Record<GroupKitType, boolean>>;
  /**
   * Kits na mesa dos kits: o convidado pega o kit dele depois da própria entrada,
   * sem esperar quem convidou (decisão da organização para a mesa).
   */
  guestIndependent?: boolean;
  /** Um kit por inscrição, para os dois (ver `Edition.sharedKit`): o convidado não tem kit próprio. */
  sharedKit?: boolean;
}

/**
 * Professor(a) filiado(a) tem direito a 1 kit próprio e 1 kit para o seu
 * convidado. Os kits saem na recepção, junto com as entradas: o do(a)
 * professor(a) na entrada dele(a); o do convidado só quando os dois já chegaram
 * (na entrada do convidado ou, se ele chegou antes, na chegada do(a) professor(a)).
 * Convidado fictício não gera kit. Filiados(as) que não são professoras ou
 * professores não têm direito a kit. Até o horário dos kits guardados, o kit de
 * quem está na fila espera; depois dele, as sobras saem por ordem de chegada.
 * Na festa de kit dividido, só existe o kit do(a) filiado(a), que é para os dois.
 */
export function kitAvailability(reg: KitRegistrationInput, kitType: GroupKitType): KitAvailability {
  const delivered = reg.deliveries[kitType];
  if (delivered) return { kind: "DELIVERED", delivery: delivered };
  if (!isActiveMember(reg.status)) return { kind: "BLOCKED", code: "NOT_ACTIVE_MEMBER" };
  if (!reg.isTeacher) return { kind: "BLOCKED", code: "NOT_TEACHER" };
  if (kitType === "MEMBER") {
    if (reg.memberReceivedGuestKit) return { kind: "BLOCKED", code: "MEMBER_GOT_GUEST_KIT" };
    if (!reg.memberCheckedIn) return { kind: "BLOCKED", code: "MEMBER_NOT_CHECKED_IN" };
  } else {
    if (!reg.hasGuest) return { kind: "BLOCKED", code: "NO_GUEST" };
    if (reg.sharedKit) return { kind: "BLOCKED", code: "SHARED_KIT" };
    // O kit do convidado só sai depois que o(a) professor(a) que convidou chegou (na mesa dos kits, não espera)...
    if (!reg.memberCheckedIn && !reg.guestIndependent) return { kind: "BLOCKED", code: "HOST_NOT_CHECKED_IN" };
    // ...e com o convidado presente (convidado fictício não gera kit).
    if (!reg.guestCheckedIn) return { kind: "BLOCKED", code: "GUEST_NOT_CHECKED_IN" };
  }
  // Por último: tudo certo, só falta vagar kit (a fila guarda o kit de quem se inscreveu antes).
  // Depois do horário dos kits guardados, as sobras saem também para quem está na fila.
  if (reg.waitlisted?.[kitType] && !reg.deadlinePassed) return { kind: "BLOCKED", code: "KIT_WAITLIST" };
  return { kind: "AVAILABLE" };
}

export interface EmployeeKitInput {
  /** Na lista de funcionários (não foi tirado(a) da lista). */
  active: boolean;
  /** Tem direito a kit (só cortesia pode ser cadastrada "sem kit"). */
  withKit?: boolean;
  employeeCheckedIn: boolean;
  hasGuest: boolean;
  /** O convidado do(a) funcionário(a) já entrou na festa. */
  guestCheckedIn: boolean;
  deliveries: EmployeeDeliveries;
  /** Passou o horário dos kits guardados (o kit do(a) colaborador(a) sai do mesmo jeito, se houver). */
  deadlinePassed: boolean;
  /** Mesa dos kits: o convidado não espera quem convidou (ver KitRegistrationInput). */
  guestIndependent?: boolean;
}

/**
 * Funcionário(a) do SINDSERM: 1 kit próprio, que sai na entrada dele(a), e 1
 * kit para o convidado, só depois que o(a) funcionário(a) chegou — a mesma
 * regra do convidado de professor(a). Os dois saem do estoque dos funcionários.
 */
export function employeeKitAvailability(input: EmployeeKitInput, kitType: EmployeeKitType): KitAvailability {
  const delivered = input.deliveries[kitType];
  if (delivered) return { kind: "DELIVERED", delivery: delivered };
  if (!input.active) return { kind: "BLOCKED", code: "EMPLOYEE_REMOVED" };
  if (kitType === "EMPLOYEE" && input.withKit === false) return { kind: "BLOCKED", code: "WITHOUT_KIT" };
  if (kitType === "EMPLOYEE") {
    if (!input.employeeCheckedIn) return { kind: "BLOCKED", code: "EMPLOYEE_NOT_CHECKED_IN" };
  } else {
    if (!input.hasGuest) return { kind: "BLOCKED", code: "NO_GUEST" };
    if (!input.employeeCheckedIn && !input.guestIndependent) return { kind: "BLOCKED", code: "HOST_NOT_CHECKED_IN" };
    if (!input.guestCheckedIn) return { kind: "BLOCKED", code: "GUEST_NOT_CHECKED_IN" };
  }
  return { kind: "AVAILABLE" };
}

/**
 * Pool de estoque consumido por um kit no modo configurado. Os kits do grupo de
 * um(a) funcionário(a) (o dele(a) e o do convidado) saem sempre do estoque dos
 * funcionários, separado dos kits de professoras, professores e convidados.
 */
export function stockPoolFor(mode: StockMode, kitType: KitType, employeeGroup = false): StockPool {
  // Estoque único para todos: qualquer kit (inclusive de colaboradores e cortesias) sai do mesmo total.
  if (mode === "UNIFIED") return "ALL";
  if (employeeGroup || kitType === "EMPLOYEE") return "EMPLOYEE";
  if (mode === "SINGLE") return "ALL";
  return kitType === "MEMBER" ? "MEMBER" : "GUEST";
}

export function poolsForMode(mode: StockMode): StockPool[] {
  if (mode === "UNIFIED") return ["ALL"];
  return mode === "SINGLE" ? ["ALL", "EMPLOYEE"] : ["MEMBER", "GUEST", "EMPLOYEE"];
}

/** De qual estoque saem os kits de colaboradores, convidados deles e cortesias. */
export function employeeStockPool(mode: StockMode): StockPool {
  return stockPoolFor(mode, "EMPLOYEE", true);
}

export function isLowStock(available: number, threshold: number): boolean {
  return available <= threshold;
}

/** Gordura: alerta quando restar 10% (no mínimo 2 kits). O limite geral, pensado para centenas de kits, não serve. */
export function isLowExtraStock(available: number, total: number): boolean {
  return total > 0 && available <= Math.max(2, Math.ceil(total * 0.1));
}

/**
 * Estoque dos funcionários: a lista é conhecida (funcionários e convidados
 * deles), então o alerta é quando o que resta não dá para quem ainda vai
 * receber (o limite de alerta geral, pensado para centenas de kits, deixaria o
 * painel sempre vermelho).
 */
export function isLowEmployeeStock(available: number, awaiting: number): boolean {
  return awaiting > 0 && available < awaiting;
}

// ---------------------------------------------------------------------------
// Convidado (um por professor(a) ou por funcionário(a))
// ---------------------------------------------------------------------------

/** Cada professor(a) ou funcionário(a) pode levar um único convidado, com direito ao kit. */
export const MAX_GUESTS = 1;

/** Só professoras e professores com filiação não rejeitada podem ter convidado. */
export function canHaveGuest(reg: { status: AffiliationStatus; isTeacher: boolean }): boolean {
  return reg.isTeacher && reg.status !== "REJECTED";
}

export type GuestRemovalCheck =
  | { ok: true }
  | { ok: false; code: "GUEST_CHECKED_IN" | "GUEST_KIT_DELIVERED" };

/**
 * O convidado pode ser removido/trocado enquanto não entrou e enquanto o kit
 * dele não foi retirado. Depois disso, só estornando a entrega (administrador).
 */
export function guestRemovalCheck(input: { guestCheckedIn: boolean; guestKitDeliveredForGuest: boolean }): GuestRemovalCheck {
  if (input.guestCheckedIn) return { ok: false, code: "GUEST_CHECKED_IN" };
  if (input.guestKitDeliveredForGuest) return { ok: false, code: "GUEST_KIT_DELIVERED" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Permissões (verificadas no servidor): por área do sistema, ver ./access
// ---------------------------------------------------------------------------

export { can, type Permission } from "./access";
