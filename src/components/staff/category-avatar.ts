import type { EmployeeCategory } from "@/domain/types";

/**
 * Iniciais no "metal" da categoria (listas de colaboradores e de cortesias).
 * Fica fora dos módulos "use client": as páginas do servidor precisam ler o valor
 * (de um módulo de cliente, elas só recebem uma referência vazia).
 */
export const CATEGORY_AVATAR: Record<EmployeeCategory, string> = {
  BOARD: "bg-[#e4e4e7] text-ink shadow-[0_3px_0_0_#71717a]",
  STAFF: "bg-warning text-warning-foreground shadow-[0_3px_0_0_#8a6a00]",
  CONTRACTOR: "bg-[#22d3ee] text-ink shadow-[0_3px_0_0_#0e7490]",
  COURTESY: "bg-[#ff4fb4] text-ink shadow-[0_3px_0_0_#9d174d]",
};
