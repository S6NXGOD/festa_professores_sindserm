import "server-only";
import type { Executor } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import { type Actor, actorLabel, actorUserId } from "./actor";

export const AUDIT_ACTIONS = {
  ADMIN_BOOTSTRAPPED: "Primeiro administrador criado",
  ADMIN_CREATED_CLI: "Administrador criado pela linha de comando",
  SETUP_COMPLETED: "Configuração inicial concluída",
  SETTINGS_UPDATED: "Configurações do evento alteradas",
  VENUE_UPDATED: "Local da festa alterado",
  VENUE_PHOTO_UPDATED: "Foto do local alterada",
  VENUE_PHOTO_REMOVED: "Foto do local removida",
  DATABASE_RESET: "Banco de dados zerado",
  STOCK_UPDATED: "Estoque de kits alterado",
  USER_CREATED: "Usuário criado",
  USER_UPDATED: "Usuário alterado",
  USER_PASSWORD_RESET: "Senha de usuário redefinida",
  USER_PASSWORD_CHANGED: "Usuário criou a própria senha",
  REGISTRATION_CREATED: "Inscrição criada",
  PRE_AFFILIATION_CREATED: "Ficha de filiação preenchida antes da festa",
  REGISTRATION_ACCESS_RENEWED: "Link de vouchers renovado",
  AFFILIATION_CONFIRMED: "Filiação confirmada",
  AFFILIATION_REJECTED: "Filiação não confirmada",
  AFFILIATION_REOPENED: "Conferência de filiação reaberta",
  AFFILIATION_PROVEN: "Filiação confirmada após comprovação",
  AFFILIATION_FORM_SAVED: "Ficha de filiação salva",
  AFFILIATION_FORM_CANCELLED: "Ficha de filiação cancelada",
  AFFILIATION_FORMALIZED: "Ficha de filiação assinada",
  DECLARED_MEMBER_REGISTERED: "Convidado cadastrado como filiado",
  TEACHER_STATUS_CHANGED: "Resposta \"é professor(a)?\" corrigida",
  GUEST_ADDED: "Convidado cadastrado",
  GUEST_REPLACED: "Convidado trocado",
  GUEST_REMOVED: "Convidado removido",
  GUEST_PROMOTED: "Convidado passou a ser filiado",
  CHECKIN_REGISTERED: "Entrada registrada",
  CHECKIN_CANCELLED: "Entrada estornada",
  KIT_DELIVERED: "Kit entregue",
  KIT_DELIVERY_CANCELLED: "Entrega de kit estornada",
  VOUCHER_REISSUED: "Voucher reemitido",
  PERSON_CORRECTED: "Cadastro corrigido",
  HELP_CONTACT_UPDATED: "WhatsApp de ajuda alterado",
  SHARE_MESSAGE_UPDATED: "Mensagem de divulgação alterada",
  EMPLOYEE_ADDED: "Colaborador(a) do SINDSERM liberado(a)",
  EMPLOYEE_UPDATED: "Colaborador(a) do SINDSERM alterado(a)",
  EMPLOYEE_REMOVED: "Colaborador(a) tirado(a) da lista",
  EMPLOYEE_RESTORED: "Colaborador(a) de volta à lista",
  DOCUMENT_ATTACHED: "Documento anexado à ficha",
  DOCUMENT_VIEWED: "Documento da ficha aberto",
  DOCUMENT_REMOVED: "Documento da ficha apagado",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export interface AuditEntry {
  action: AuditAction;
  entityType:
    | "event"
    | "user"
    | "registration"
    | "person"
    | "guest_link"
    | "check_in"
    | "kit_delivery"
    | "affiliation_form"
    | "voucher"
    | "stock"
    | "employee";
  entityId?: string | null;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Registra operação sensível. Não grave dados pessoais desnecessários aqui:
 * use CPF mascarado e apenas os campos relevantes para a auditoria.
 */
export async function writeAudit(ex: Executor, actor: Actor, entry: AuditEntry) {
  await ex.insert(auditLog).values({
    actorUserId: actorUserId(actor),
    actorLabel: actorLabel(actor),
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
