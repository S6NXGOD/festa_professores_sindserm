import { EDITION } from "./edition";
import type { EmployeeCategory, ParticipantRole } from "./types";

/**
 * Grupo de quem vem buscar o kit (cor e etiqueta na mesa dos kits):
 * professor(a), convidado(a) de professor(a), diretoria, funcionário(a),
 * prestador(a), convidado(a) de colaborador(a) e cortesia.
 */
export type DeskCategory = "TEACHER" | "MEMBER" | "TEACHER_GUEST" | "BOARD" | "STAFF" | "CONTRACTOR" | "EMPLOYEE_GUEST" | "COURTESY";

/** A ordem da legenda da mesa (quem tem kit; no kit dividido, o convidado de inscrito não tem kit próprio). */
export const DESK_CATEGORY_ORDER: readonly DeskCategory[] = EDITION.sharedKit
  ? ["TEACHER", "BOARD", "STAFF", "CONTRACTOR", "EMPLOYEE_GUEST", "COURTESY"]
  : ["TEACHER", "TEACHER_GUEST", "BOARD", "STAFF", "CONTRACTOR", "EMPLOYEE_GUEST", "COURTESY"];

export function deskCategoryOf(input: {
  role: ParticipantRole;
  isTeacher?: boolean | null;
  /** Convidado(a) de um(a) colaborador(a) do SINDSERM (e não de um(a) professor(a)). */
  guestOfEmployee?: boolean;
  employeeCategory?: EmployeeCategory | null;
}): DeskCategory {
  if (input.role === "EMPLOYEE") return input.employeeCategory ?? "STAFF";
  if (input.role === "GUEST") return input.guestOfEmployee ? "EMPLOYEE_GUEST" : "TEACHER_GUEST";
  return input.isTeacher === false ? "MEMBER" : "TEACHER";
}
