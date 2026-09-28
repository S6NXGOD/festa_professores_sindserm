export const AFFILIATION_STATUSES = ["PENDING", "AWAITING_SIGNATURE", "CONFIRMED", "REJECTED", "JOINED_AT_EVENT"] as const;
export type AffiliationStatus = (typeof AFFILIATION_STATUSES)[number];

export const STAFF_ROLES = ["ADMIN", "ATTENDANT", "SECURITY"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Cadastro interno da organização: colaboradores do SINDSERM (diretoria,
 * funcionários e prestadores: voucher, 1 kit e 1 convidado) e cortesias
 * (amigos, familiares e convidados da organização: voucher e 1 kit, sem convidado).
 */
export const EMPLOYEE_CATEGORIES = ["BOARD", "STAFF", "CONTRACTOR", "COURTESY"] as const;
export type EmployeeCategory = (typeof EMPLOYEE_CATEGORIES)[number];

/** Só os colaboradores (a tela Colaboradores e a escolha de categoria). */
export const COLLABORATOR_CATEGORIES = ["BOARD", "STAFF", "CONTRACTOR"] as const satisfies readonly EmployeeCategory[];
export type CollaboratorCategory = (typeof COLLABORATOR_CATEGORIES)[number];

/** Cortesia da organização: cada pessoa é a própria cortesia (não leva convidado). */
export function isCourtesy(category: EmployeeCategory | null | undefined): boolean {
  return category === "COURTESY";
}

/** EMPLOYEE: kit do(a) funcionário(a) do SINDSERM (estoque dos funcionários). */
export type KitType = "MEMBER" | "GUEST" | "EMPLOYEE";
/** Kits do grupo de um(a) professor(a). */
export type GroupKitType = Exclude<KitType, "EMPLOYEE">;
/** Kits do grupo de um(a) funcionário(a): o dele(a) e o do convidado (os dois do estoque dos funcionários). */
export type EmployeeKitType = Exclude<KitType, "MEMBER">;
export type StockMode = "SINGLE" | "SPLIT";
export type StockPool = "ALL" | "MEMBER" | "GUEST" | "EMPLOYEE";
export type ParticipantRole = "MEMBER" | "GUEST" | "EMPLOYEE";
export type CheckInMethod = "QR" | "SEARCH" | "CODE";
/** De onde veio a inscrição (mesmos valores do banco). */
export type RegistrationOrigin = "PUBLIC_FORM" | "PRE_AFFILIATION" | "STAFF" | "GUEST_CONVERSION" | "NEW_AFFILIATION";

export const DOCUMENT_KINDS = ["RG", "PAYSLIP"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface CheckInInfo {
  id: string;
  checkedInAt: Date;
  checkedInByName: string;
  method: CheckInMethod;
  role: ParticipantRole;
}

export interface DeliveryInfo {
  id: string;
  kitType: KitType;
  deliveredAt: Date;
  deliveredByName: string;
  beneficiaryPersonId: string;
  beneficiaryName: string;
}

export type Deliveries = Partial<Record<GroupKitType, DeliveryInfo>>;
export type EmployeeDeliveries = Partial<Record<EmployeeKitType, DeliveryInfo>>;
