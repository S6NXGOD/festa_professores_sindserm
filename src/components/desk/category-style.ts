import type { DeskCategory } from "@/domain/desk-category";
import { T } from "@/domain/edition";

/*
 * Cor de cada grupo na mesa dos kits: as mesmas dos vouchers (professor(a) em
 * vermelho, diretoria em platina, funcionário(a) em dourado, prestador(a) em
 * ciano, cortesia em rosa), mais o roxo dos convidados de professor(a) e o
 * laranja dos convidados da casa. Arquivo comum (sem "use client"): as páginas
 * do servidor também leem.
 */
export const DESK_CATEGORY_STYLE: Record<DeskCategory, { label: string; color: string; text: string }> = {
  TEACHER: { label: T.Person, color: "#ff3b3b", text: "#ffffff" },
  MEMBER: { label: "Filiado(a)", color: "#8b8781", text: "#0a0a0a" },
  TEACHER_GUEST: { label: "Convidado(a)", color: "#b794ff", text: "#140b2e" },
  BOARD: { label: "Diretoria", color: "#e4e4e7", text: "#0a0a0a" },
  STAFF: { label: "Funcionário(a)", color: "#f8c000", text: "#1a1200" },
  CONTRACTOR: { label: "Prestador(a)", color: "#22d3ee", text: "#06232a" },
  EMPLOYEE_GUEST: { label: "Convidado(a) da casa", color: "#ff8a3d", text: "#2a1200" },
  COURTESY: { label: "Cortesia", color: "#ff4fb4", text: "#2a0016" },
};
