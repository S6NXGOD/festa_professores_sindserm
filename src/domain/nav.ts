import type { Permission } from "./access";

/*
 * Menu do painel. Cada item aparece para quem tem exatamente a permissão que a
 * página dele exige (um teste confere página por página): ninguém vê um item
 * que o manda de volta para o início.
 */

export interface NavEntry {
  href: string;
  label: string;
  permission: Permission;
  exact?: boolean;
  /** Fila de trabalho mostrada no item ("pending": inscrições para conferir; "signature": fichas para assinar). */
  badge?: "pending" | "signature";
  /** Com trabalho na fila, o item já abre nela (sem passar pelo redirecionamento da página). */
  queueHref?: string;
}

export const PANEL_NAV: { title: string; items: NavEntry[] }[] = [
  {
    title: "Na festa",
    items: [
      { href: "/painel", label: "Placar", permission: "viewDashboard", exact: true },
      { href: "/portaria", label: "Portaria", permission: "viewGate" },
      { href: "/painel/entradas", label: "Entradas", permission: "viewEntries" },
      { href: "/painel/kits", label: "Kits e estoque", permission: "viewKits" },
    ],
  },
  {
    title: "Pessoas",
    // As filas de trabalho moram nas próprias listas: conferir em Inscrições, assinar em Fichas.
    items: [
      { href: "/painel/inscricoes", label: "Inscrições", permission: "viewRegistrations", badge: "pending", queueHref: "/painel/inscricoes?filtro=conferir" },
      { href: "/painel/filiacoes", label: "Fichas de filiação", permission: "viewForms", badge: "signature", queueHref: "/painel/filiacoes?filtro=assinar" },
      { href: "/painel/colaboradores", label: "Colaboradores SINDSERM", permission: "viewEmployees" },
    ],
  },
  {
    title: "Administração",
    items: [
      { href: "/painel/usuarios", label: "Acesso ao sistema", permission: "manageUsers" },
      { href: "/painel/auditoria", label: "Auditoria", permission: "viewAudit" },
      { href: "/painel/configuracoes", label: "Configurações", permission: "manageSettings" },
    ],
  },
];
