import { plural } from "@/lib/plural";
import { employeeCategoryCount } from "./labels";
import { COLLABORATOR_CATEGORIES, type CollaboratorCategory, type StockPool } from "./types";

/*
 * Quadro "Pessoas e kits": cada grupo de quem vem à festa lado a lado — quantas
 * pessoas, quantas têm direito a kit, quantos kits já saíram, quantos faltam e
 * quem já entrou. A previsão por estoque é a mesma conta do cartão de estoque.
 */

export type PeopleGroupId = "TEACHERS" | "TEACHER_GUESTS" | "OTHER_MEMBERS" | "EMPLOYEES" | "EMPLOYEE_GUESTS" | "COURTESIES" | "WITHOUT_KIT";

export interface PeopleGroupRow {
  id: PeopleGroupId;
  /** Pessoas esperadas no grupo (inclui quem ainda aguarda conferência ou assinatura). */
  people: number;
  /** Com direito a kit agora (filiação confirmada; colaboradores, convidados deles e cortesias com kit). */
  withKit: number;
  /** Ganham kit quando a filiação for confirmada (aguardando conferência ou ficha para assinar). */
  pending: number;
  /** Kits já entregues. */
  delivered: number;
  /** Já entraram na festa. */
  present: number;
}

export interface PeopleKitComparison {
  /** Professoras e professores, convidados delas e deles, outras pessoas filiadas. */
  registrations: PeopleGroupRow[];
  /** Cadastro interno: colaboradores, convidados deles, cortesias com e sem kit. */
  house: PeopleGroupRow[];
  /** Inscrições com filiação não confirmada: não entram na conta. */
  rejected: number;
  /** Colaboradores por categoria (diretoria, funcionários, prestadores). */
  employeeCategories: Record<CollaboratorCategory, number>;
  /** Dos "sem kit": os trazidos por colaboradores (convidados sem kit). */
  companions: number;
}

export const PEOPLE_GROUP_LABEL: Record<PeopleGroupId, string> = {
  TEACHERS: "Professoras e professores",
  TEACHER_GUESTS: "Convidados das professoras e professores",
  OTHER_MEMBERS: "Outras pessoas filiadas",
  EMPLOYEES: "Colaboradores do SINDSERM",
  EMPLOYEE_GUESTS: "Convidados dos colaboradores",
  COURTESIES: "Cortesias com kit",
  WITHOUT_KIT: "Cortesias e convidados sem kit",
};

/** Grupos que não têm direito a kit (a linha mostra "sem kit" no lugar dos números de kit). */
export const GROUPS_WITHOUT_KIT: readonly PeopleGroupId[] = ["OTHER_MEMBERS", "WITHOUT_KIT"];

/** A regra de cada grupo, numa linha. */
export function peopleGroupDetail(row: PeopleGroupRow, comparison: PeopleKitComparison): string {
  switch (row.id) {
    case "TEACHERS":
      return "1 kit cada, com a filiação confirmada";
    case "TEACHER_GUESTS":
      return "1 kit cada, depois que quem convidou chega";
    case "OTHER_MEMBERS":
      return "Não são professoras nem professores: entram sem kit";
    case "EMPLOYEES": {
      const parts = COLLABORATOR_CATEGORIES.filter((c) => comparison.employeeCategories[c] > 0).map((c) =>
        employeeCategoryCount(c, comparison.employeeCategories[c]),
      );
      return parts.length ? parts.join(" · ") : "Diretoria, funcionários e prestadores";
    }
    case "EMPLOYEE_GUESTS":
      return "1 kit cada, do estoque dos colaboradores";
    case "COURTESIES":
      return "Amigos e familiares da organização, 1 kit cada";
    case "WITHOUT_KIT":
      return comparison.companions
        ? `Só a entrada · ${plural(comparison.companions, "trazido por colaborador(a)", "trazidos por colaboradores")}`
        : "Só a entrada";
  }
}

/** Kits que ainda vão sair: quem tem direito e não recebeu (sai na entrada). */
export function toDeliver(row: Pick<PeopleGroupRow, "withKit" | "delivered">): number {
  return Math.max(0, row.withKit - row.delivered);
}

/** Grupos que sempre aparecem (mesmo zerados); os outros só quando têm alguém. */
const ALWAYS_SHOWN: readonly PeopleGroupId[] = ["TEACHERS", "TEACHER_GUESTS", "EMPLOYEES"];

export function visibleRows(rows: PeopleGroupRow[]): PeopleGroupRow[] {
  return rows.filter((row) => ALWAYS_SHOWN.includes(row.id) || row.people > 0 || row.delivered > 0);
}

export type PeopleTotals = Omit<PeopleGroupRow, "id"> & { toDeliver: number };

export function sumRows(rows: PeopleGroupRow[]): PeopleTotals {
  return rows.reduce<PeopleTotals>(
    (sum, row) => ({
      people: sum.people + row.people,
      withKit: sum.withKit + row.withKit,
      pending: sum.pending + row.pending,
      delivered: sum.delivered + row.delivered,
      present: sum.present + row.present,
      toDeliver: sum.toDeliver + toDeliver(row),
    }),
    { people: 0, withKit: 0, pending: 0, delivered: 0, present: 0, toDeliver: 0 },
  );
}

/** Kits previstos por tipo de estoque, contando quem aguarda conferência (a conta da previsão do estoque). */
export interface KitDemand {
  member: number;
  guest: number;
  employee?: number;
}

export function kitDemandOf(comparison: PeopleKitComparison): Required<KitDemand> {
  const all = [...comparison.registrations, ...comparison.house];
  const row = (id: PeopleGroupId) => all.find((r) => r.id === id);
  const planned = (id: PeopleGroupId) => (row(id)?.withKit ?? 0) + (row(id)?.pending ?? 0);
  return {
    member: planned("TEACHERS"),
    guest: planned("TEACHER_GUESTS"),
    employee: planned("EMPLOYEES") + planned("EMPLOYEE_GUESTS") + planned("COURTESIES"),
  };
}

/** Quantos kits a previsão tira de cada estoque. */
export function poolDemand(pool: StockPool, demand: KitDemand): number {
  if (pool === "ALL") return demand.member + demand.guest;
  if (pool === "EMPLOYEE") return demand.employee ?? 0;
  return pool === "MEMBER" ? demand.member : demand.guest;
}

export const POOL_SHORT_LABEL: Record<StockPool, string> = {
  ALL: "geral",
  MEMBER: "de professoras e professores",
  GUEST: "de convidados",
  EMPLOYEE: "dos colaboradores",
};

/** Previsão x estoque cadastrado, por estoque: quanto sobra (positivo) ou falta (negativo). */
export function stockBalance(pools: { pool: StockPool; total: number }[], demand: KitDemand) {
  return pools.map((pool) => {
    const planned = poolDemand(pool.pool, demand);
    return { pool: pool.pool, total: pool.total, planned, balance: pool.total - planned };
  });
}

/** Resumo em texto (WhatsApp ou onde quiser colar). */
export function peopleKitsSummary(input: {
  eventName: string;
  when: string;
  comparison: PeopleKitComparison;
  pools: { pool: StockPool; total: number }[];
}): string {
  const { comparison } = input;
  const line = (row: PeopleGroupRow) => {
    const label = PEOPLE_GROUP_LABEL[row.id];
    if (GROUPS_WITHOUT_KIT.includes(row.id) && row.delivered === 0) return `• ${label}: ${row.people} (sem kit)`;
    const waiting = row.pending ? ` (+${row.pending} a confirmar)` : "";
    return `• ${label}: ${row.people} · ${row.withKit} com kit${waiting}`;
  };
  const registrations = visibleRows(comparison.registrations);
  const house = visibleRows(comparison.house);
  const totals = sumRows([...comparison.registrations, ...comparison.house]);
  const balances = stockBalance(input.pools, kitDemandOf(comparison));
  const stockLine = balances.length
    ? "Estoque: " +
      balances
        .map((b) => `${POOL_SHORT_LABEL[b.pool]} ${b.total} para ${b.planned} previstos (${b.balance >= 0 ? `sobram ${b.balance}` : `faltam ${-b.balance}`})`)
        .join(" · ")
    : "Estoque: não cadastrado";
  return [
    `${input.eventName} – pessoas e kits (${input.when})`,
    "",
    "INSCRIÇÕES",
    ...registrations.map(line),
    ...(comparison.rejected ? [`• Filiação não confirmada (fora da conta): ${comparison.rejected}`] : []),
    "",
    "SINDSERM",
    ...house.map(line),
    "",
    `TOTAL: ${plural(totals.people, "pessoa", "pessoas")} · ${plural(totals.withKit, "kit garantido", "kits garantidos")}${totals.pending ? ` (+${totals.pending} a confirmar)` : ""}`,
    stockLine,
    `Entregues até agora: ${totals.delivered} · faltam sair: ${totals.toDeliver} · já entraram: ${totals.present}`,
  ].join("\n");
}
