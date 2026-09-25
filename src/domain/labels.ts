import type { EntryBlockCode, KitBlockCode } from "./rules";
import type { AffiliationStatus, CheckInMethod, DocumentKind, KitType, StaffRole, StockMode, StockPool } from "./types";

/** Nome da entidade organizadora (sistema de uso exclusivo do sindicato). */
export const ORG_NAME = "SINDSERM";

export const AFFILIATION_STATUS_LABEL: Record<AffiliationStatus, string> = {
  PENDING: "Aguardando conferência",
  AWAITING_SIGNATURE: "Ficha aguardando assinatura",
  CONFIRMED: "Filiação confirmada",
  REJECTED: "Filiação não confirmada",
  JOINED_AT_EVENT: "Filiado(a) na festa",
};

export const AFFILIATION_STATUS_SHORT: Record<AffiliationStatus, string> = {
  PENDING: "Pendente",
  AWAITING_SIGNATURE: "Assinar ficha",
  CONFIRMED: "Confirmado",
  REJECTED: "Não confirmado",
  JOINED_AT_EVENT: "Filiou-se na festa",
};

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export const AFFILIATION_STATUS_TONE: Record<AffiliationStatus, StatusTone> = {
  PENDING: "warning",
  AWAITING_SIGNATURE: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  JOINED_AT_EVENT: "success",
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: "Administrador",
  ATTENDANT: "Atendimento",
  SECURITY: "Segurança/Recepção",
};

export const ROLE_DESCRIPTION: Record<StaffRole, string> = {
  ADMIN: "Acesso total: configurações, funcionários do SINDSERM, usuários, relatórios e auditoria.",
  ATTENDANT: "Portaria, conferência de filiação, fichas, convidados e kits.",
  SECURITY: "Somente leitura de QR, pesquisa e registro de entrada.",
};

export const KIT_TYPE_LABEL: Record<KitType, string> = {
  MEMBER: "Kit do(a) professor(a)",
  GUEST: "Kit do convidado",
  EMPLOYEE: "Kit de funcionário(a)",
};

export const STOCK_MODE_LABEL: Record<StockMode, string> = {
  SINGLE: "Estoque único",
  SPLIT: "Estoque separado (professoras e professores / convidados)",
};

export const STOCK_POOL_LABEL: Record<StockPool, string> = {
  ALL: "Kits (estoque único)",
  MEMBER: "Kits de professor(a)",
  GUEST: "Kits de convidado",
  EMPLOYEE: "Kits de funcionários",
};

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  RG: "RG",
  PAYSLIP: "Contracheque",
};

/** Funcionário(a) do SINDSERM: o nome que aparece no voucher e na portaria. */
export const EMPLOYEE_LABEL = "Funcionário(a) do SINDSERM";

export const CHECK_IN_METHOD_LABEL: Record<CheckInMethod, string> = {
  QR: "QR Code",
  SEARCH: "Pesquisa manual",
  CODE: "Código do voucher",
};

export const TEACHER_LABEL = (isTeacher: boolean) => (isTeacher ? "Professor(a)" : "Filiado(a) — não professor(a)");

export const ENTRY_BLOCK_MESSAGE: Record<EntryBlockCode, { title: string; detail: string }> = {
  MEMBER_PENDING: {
    title: "Filiação aguardando conferência",
    detail: "Encaminhe ao Atendimento para conferir a filiação antes da entrada.",
  },
  MEMBER_AWAITING_SIGNATURE: {
    title: "Falta assinar a ficha de filiação",
    detail: "A ficha já foi preenchida. Encaminhe ao Atendimento para imprimir e assinar a autorização de desconto.",
  },
  MEMBER_REJECTED: {
    title: "Filiação não confirmada",
    detail:
      "Se comprovar agora que é filiado(a) (ex.: contracheque com o desconto do SINDSERM), o Atendimento confirma na hora. Sem comprovação: pode entrar como convidado(a) de um(a) professor(a) ou se filiar no Atendimento.",
  },
  HOST_PENDING: {
    title: "Responsável ainda não liberado",
    detail: "A entrada do convidado depende da filiação do(a) professor(a) responsável. Encaminhe ao Atendimento.",
  },
  HOST_REJECTED: {
    title: "Filiação do responsável não confirmada",
    detail: "Convidado só entra vinculado a um(a) professor(a) filiado(a). Procure o Atendimento.",
  },
  HOST_EMPLOYEE_REMOVED: {
    title: "Funcionário(a) responsável fora da lista",
    detail: "Este convidado só entra vinculado a um(a) funcionário(a) da lista do SINDSERM. Procure a organização.",
  },
  EMPLOYEE_REMOVED: {
    title: "Fora da lista de funcionários",
    detail: "Este voucher foi retirado da lista de funcionários do SINDSERM liberados para a festa. Procure a organização.",
  },
  NO_ACTIVE_REGISTRATION: {
    title: "Sem inscrição ativa",
    detail: "Esta pessoa não possui inscrição válida. Procure o Atendimento.",
  },
};

export const KIT_BLOCK_MESSAGE: Record<KitBlockCode, string> = {
  NOT_ACTIVE_MEMBER: "Sai na entrada, depois que a filiação for confirmada.",
  NOT_TEACHER: "Kit de consumação é exclusivo para professoras e professores.",
  DEADLINE_PASSED: "Prazo para entregar kits encerrado.",
  MEMBER_NOT_CHECKED_IN: "Sai junto com a entrada.",
  NO_GUEST: "Nenhum convidado cadastrado.",
  HOST_NOT_CHECKED_IN: "Sai depois que quem convidou chegar.",
  GUEST_NOT_CHECKED_IN: "Sai junto com a entrada do convidado.",
  MEMBER_GOT_GUEST_KIT: "Já recebeu o kit quando entrou como convidado(a).",
  EMPLOYEE_REMOVED: "Fora da lista de funcionários.",
  EMPLOYEE_NOT_CHECKED_IN: "Sai junto com a entrada.",
};

/** O que a recepção lê quando a pessoa entra sem kit (ela entra do mesmo jeito). */
export const ENTRY_KIT_MESSAGE: Record<
  KitBlockCode | "ALREADY" | "GUEST_KIT_USED" | "OUT_OF_STOCK" | "NO_STOCK_CONFIG" | "NO_EMPLOYEE_STOCK",
  string
> = {
  EMPLOYEE_REMOVED: "Sem kit: fora da lista de funcionários.",
  EMPLOYEE_NOT_CHECKED_IN: "Sem kit.",
  NO_EMPLOYEE_STOCK: "Sem kit: cadastre o estoque de kits dos funcionários (Kits e estoque).",
  NOT_ACTIVE_MEMBER: "Sem kit: a filiação ainda não foi confirmada.",
  NOT_TEACHER: "Sem kit: não é professor(a).",
  DEADLINE_PASSED: "Sem kit: o horário de entregar kits já passou.",
  MEMBER_NOT_CHECKED_IN: "Sem kit.",
  NO_GUEST: "Sem kit.",
  HOST_NOT_CHECKED_IN: "Kit fica para depois: sai quando quem convidou chegar.",
  GUEST_NOT_CHECKED_IN: "Sem kit.",
  MEMBER_GOT_GUEST_KIT: "Sem kit: já recebeu o kit como convidado(a).",
  ALREADY: "O kit já tinha sido entregue.",
  GUEST_KIT_USED: "Sem kit: o kit de convidado deste grupo já foi entregue.",
  OUT_OF_STOCK: "Sem kit: o estoque acabou.",
  NO_STOCK_CONFIG: "Sem kit: estoque não configurado.",
};
