import type { StaffRole } from "./types";

/*
 * Permissões por área do sistema. Administrador tem acesso total, sem ajuste;
 * Atendimento e Segurança/Recepção são modelos que podem ser ajustados área por
 * área para cada pessoa. O servidor confere tudo a partir deste mapa.
 */

export const ACCESS_LEVELS = ["none", "view", "edit"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_MODULES = [
  "placar",
  "portaria",
  "entradas",
  "kits",
  "inscricoes",
  "fichas",
  "colaboradores",
  "correcoes",
  "usuarios",
  "auditoria",
  "configuracoes",
] as const;
export type AccessModule = (typeof ACCESS_MODULES)[number];

export interface AccessMap {
  modules: Record<AccessModule, AccessLevel>;
  /** CPF completo nas buscas e telas (sem isto, aparece mascarado). */
  fullCpf: boolean;
}

export const ACCESS_GROUPS = [
  { title: "Na festa", modules: ["placar", "portaria", "entradas", "kits"] },
  { title: "Pessoas", modules: ["inscricoes", "fichas", "colaboradores"] },
  { title: "Administração", modules: ["correcoes", "usuarios", "auditoria", "configuracoes"] },
] as const satisfies readonly { title: string; modules: readonly AccessModule[] }[];

/** O que cada nível libera em cada área (e quais níveis existem ali). */
export const MODULE_INFO: Record<AccessModule, { label: string; levels: readonly AccessLevel[]; view?: string; edit?: string }> = {
  placar: { label: "Placar", levels: ["none", "view"], view: "Números da festa, filas e últimas entradas" },
  entradas: {
    label: "Entradas",
    levels: ["none", "view"],
    view: "Quem entrou, a que horas, quem registrou e como; estornos e planilha",
  },
  portaria: {
    label: "Portaria",
    levels: ["none", "view", "edit"],
    view: "Buscar pessoas e ver a situação de cada uma",
    edit: "Registrar entradas (os kits saem junto)",
  },
  kits: { label: "Kits e estoque", levels: ["none", "view", "edit"], view: "Ver entregas e estoque", edit: "Entregar kits fora da entrada" },
  inscricoes: {
    label: "Inscrições",
    levels: ["none", "view", "edit"],
    view: "Ver as inscrições e o cadastro de cada pessoa",
    edit: "Conferir filiação, cadastrar na hora, convidados, corrigir dados e vouchers",
  },
  fichas: {
    label: "Fichas de filiação",
    levels: ["none", "view", "edit"],
    view: "Ver fichas e documentos",
    edit: "Fazer fichas, anexar documentos e confirmar assinatura",
  },
  colaboradores: {
    label: "Colaboradores SINDSERM",
    levels: ["none", "view", "edit"],
    view: "Ver a lista e os vouchers",
    edit: "Liberar, editar e tirar da lista",
  },
  correcoes: {
    label: "Correções",
    levels: ["none", "edit"],
    edit: "Estornar entradas e entregas de kit, reabrir conferências e apagar documentos de fichas assinadas (tudo fica na auditoria)",
  },
  usuarios: { label: "Acesso ao sistema", levels: ["none", "edit"], edit: "Criar usuários, permissões e senhas" },
  auditoria: { label: "Auditoria", levels: ["none", "view"], view: "Histórico de tudo o que foi feito" },
  configuracoes: { label: "Configurações", levels: ["none", "edit"], edit: "Dados da festa, local, estoque e WhatsApp" },
};

export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  none: "Sem acesso",
  view: "Só ver",
  // Editar já inclui ver; o texto curto cabe no botão até nos celulares estreitos.
  edit: "Editar",
};

function allModules(level: (module: AccessModule) => AccessLevel): Record<AccessModule, AccessLevel> {
  return Object.fromEntries(ACCESS_MODULES.map((module) => [module, level(module)])) as Record<AccessModule, AccessLevel>;
}

/** Maior nível que a área permite (ex.: Placar só tem "ver"). */
function topLevel(module: AccessModule): AccessLevel {
  const levels = MODULE_INFO[module].levels;
  return levels[levels.length - 1]!;
}

/** Os perfis de partida: reproduzem exatamente as regras que valiam antes da personalização. */
export const ROLE_PRESETS: Record<StaffRole, AccessMap> = {
  ADMIN: { modules: allModules(topLevel), fullCpf: true },
  ATTENDANT: {
    modules: {
      placar: "view",
      portaria: "edit",
      entradas: "view",
      kits: "edit",
      inscricoes: "edit",
      fichas: "edit",
      colaboradores: "none",
      correcoes: "none",
      usuarios: "none",
      auditoria: "none",
      configuracoes: "none",
    },
    fullCpf: true,
  },
  SECURITY: { modules: allModules((module) => (module === "portaria" ? "edit" : "none")), fullCpf: false },
};

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

export function atLeast(level: AccessLevel | undefined, wanted: AccessLevel): boolean {
  return RANK[level ?? "none"] >= RANK[wanted];
}

/** Áreas do painel (a portaria tem tela própria). */
const PANEL_MODULES = ACCESS_MODULES.filter((module) => module !== "portaria");

/** Cada permissão verificada no servidor, em termos de área + nível. */
export const PERMISSION_RULES = {
  // Portaria
  viewGate: (a: AccessMap) => atLeast(a.modules.portaria, "view"),
  // Controle de entrada (lista de quem entrou, por quem e quando)
  viewEntries: (a: AccessMap) => atLeast(a.modules.entradas, "view"),
  checkIn: (a: AccessMap) => atLeast(a.modules.portaria, "edit"),
  search: (a: AccessMap) =>
    atLeast(a.modules.portaria, "view") || atLeast(a.modules.inscricoes, "view"),
  // Painel
  viewPanel: (a: AccessMap) => PANEL_MODULES.some((module) => atLeast(a.modules[module], "view")),
  viewDashboard: (a: AccessMap) => atLeast(a.modules.placar, "view"),
  // Kits
  viewKits: (a: AccessMap) => atLeast(a.modules.kits, "view"),
  deliverKits: (a: AccessMap) => atLeast(a.modules.kits, "edit"),
  // Inscrições
  viewRegistrations: (a: AccessMap) => atLeast(a.modules.inscricoes, "view"),
  validateAffiliation: (a: AccessMap) => atLeast(a.modules.inscricoes, "edit"),
  registerAtEvent: (a: AccessMap) => atLeast(a.modules.inscricoes, "edit"),
  manageGuests: (a: AccessMap) => atLeast(a.modules.inscricoes, "edit"),
  reissueVoucher: (a: AccessMap) => atLeast(a.modules.inscricoes, "edit"),
  // Fichas de filiação
  viewForms: (a: AccessMap) => atLeast(a.modules.fichas, "view"),
  newAffiliation: (a: AccessMap) => atLeast(a.modules.fichas, "edit"),
  // Participantes
  // Cadastro de cada pessoa (dados, grupo, vouchers e histórico): faz parte de Inscrições.
  viewPeople: (a: AccessMap) => atLeast(a.modules.inscricoes, "view"),
  // Correções de administrador (estornos e reaberturas)
  adminCorrections: (a: AccessMap) => atLeast(a.modules.correcoes, "edit"),
  // Colaboradores do SINDSERM
  viewEmployees: (a: AccessMap) => atLeast(a.modules.colaboradores, "view"),
  manageEmployees: (a: AccessMap) => atLeast(a.modules.colaboradores, "edit"),
  // Administração
  manageUsers: (a: AccessMap) => atLeast(a.modules.usuarios, "edit"),
  viewAudit: (a: AccessMap) => atLeast(a.modules.auditoria, "view"),
  manageSettings: (a: AccessMap) => atLeast(a.modules.configuracoes, "edit"),
  // Dado sensível
  viewFullCpf: (a: AccessMap) => a.fullCpf,
} as const satisfies Record<string, (access: AccessMap) => boolean>;

export type Permission = keyof typeof PERMISSION_RULES;

/** A pessoa pode? (sem mapa de acesso = não pode nada). */
export function can(access: AccessMap | null | undefined, permission: Permission): boolean {
  return access ? PERMISSION_RULES[permission](access) : false;
}

/** Mantém só os níveis que cada área aceita (dados de fora não ganham acesso a mais). */
export function sanitizeAccess(input: { modules?: Partial<Record<string, unknown>>; fullCpf?: unknown }): AccessMap {
  const modules = allModules((module) => {
    const value = input.modules?.[module];
    return typeof value === "string" && (MODULE_INFO[module].levels as readonly string[]).includes(value) ? (value as AccessLevel) : "none";
  });
  return { modules, fullCpf: input.fullCpf === true };
}

export function sameAccess(a: AccessMap, b: AccessMap): boolean {
  return a.fullCpf === b.fullCpf && ACCESS_MODULES.every((module) => a.modules[module] === b.modules[module]);
}

/**
 * Administrador pode tudo: o perfil já é a permissão, sem ajuste por área
 * (decisão da organização). Atendimento e Segurança/Recepção partem do modelo
 * e podem ser ajustados pessoa a pessoa.
 */
export function isAccessFixed(role: StaffRole): boolean {
  return role === "ADMIN";
}

/** Permissões efetivas: as personalizadas, se houver; senão, as do perfil. */
export function resolveAccess(role: StaffRole, stored: string | null | undefined): AccessMap {
  // Ajuste antigo gravado num administrador não reduz nada: vale o acesso total.
  if (isAccessFixed(role)) return ROLE_PRESETS[role];
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { modules?: Record<string, unknown>; fullCpf?: unknown };
      const saved = parsed.modules ?? {};
      // Área criada depois do ajuste (ex.: Entradas): vale o padrão do perfil até alguém mexer nela.
      const modules: Record<string, unknown> = { ...ROLE_PRESETS[role].modules, ...saved };
      // "Participantes" deixou de ser área própria: o "ver" foi para Inscrições e o "editar" (estornos) para Correções.
      if (saved.participantes === "view" || saved.participantes === "edit") {
        if (!atLeast(modules.inscricoes as AccessLevel, "view")) modules.inscricoes = "view";
        if (saved.participantes === "edit" && !("correcoes" in saved)) modules.correcoes = "edit";
      }
      return sanitizeAccess({ ...parsed, modules });
    } catch {
      // JSON corrompido: cai no perfil (nunca em acesso total).
    }
  }
  return ROLE_PRESETS[role];
}

/** Para gravar: nulo quando é igual ao perfil (a pessoa acompanha o modelo) e sempre para administrador. */
export function storedAccess(role: StaffRole, access: AccessMap | null | undefined): string | null {
  if (!access || isAccessFixed(role)) return null;
  const clean = sanitizeAccess(access);
  return sameAccess(clean, ROLE_PRESETS[role]) ? null : JSON.stringify(clean);
}

/** A pessoa tem permissões diferentes do modelo do perfil? (administrador, nunca) */
export function isCustomAccess(role: StaffRole, stored: string | null | undefined): boolean {
  return !sameAccess(resolveAccess(role, stored), ROLE_PRESETS[role]);
}

/** Onde a pessoa cai ao entrar: a primeira área que ela pode ver. */
export function homePathFor(access: AccessMap): string {
  const order: [AccessModule, string][] = [
    ["placar", "/painel"],
    ["portaria", "/portaria"],
    ["entradas", "/painel/entradas"],
    ["inscricoes", "/painel/inscricoes"],
    ["fichas", "/painel/filiacoes"],
    ["kits", "/painel/kits"],
    ["colaboradores", "/painel/colaboradores"],
    ["usuarios", "/painel/usuarios"],
    ["auditoria", "/painel/auditoria"],
    ["configuracoes", "/painel/configuracoes"],
  ];
  return order.find(([module]) => atLeast(access.modules[module], "view"))?.[1] ?? "/conta";
}
