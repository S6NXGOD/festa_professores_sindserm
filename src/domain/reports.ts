import type { Permission } from "./access";

/*
 * Relatórios em PDF de cada área (kits, inscrições, colaboradores, cortesias,
 * fichas e entradas): quem vê a área pode baixar o relatório dela.
 */

export const REPORT_TYPES = ["kits", "inscricoes", "colaboradores", "cortesias", "fichas", "entradas"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_INFO: Record<ReportType, { title: string; kicker: string; permission: Permission }> = {
  kits: { title: "Kits e estoque", kicker: "Relatório · Consumação", permission: "viewKits" },
  inscricoes: { title: "Inscrições", kicker: "Relatório · Inscrições", permission: "viewRegistrations" },
  colaboradores: { title: "Colaboradores do SINDSERM", kicker: "Relatório · Da casa", permission: "viewEmployees" },
  cortesias: { title: "Cortesias", kicker: "Relatório · Convites", permission: "viewEmployees" },
  fichas: { title: "Fichas de filiação", kicker: "Relatório · Filiação", permission: "viewForms" },
  entradas: { title: "Entradas", kicker: "Relatório · Portaria", permission: "viewEntries" },
};

export function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}

/** "relatorio-kits-2026-10-16.pdf" */
export function reportFileName(type: ReportType, day: string): string {
  return `relatorio-${type}-${day}.pdf`;
}
