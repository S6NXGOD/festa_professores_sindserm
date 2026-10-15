import "server-only";
import { sql } from "drizzle-orm";
import {
  GROUPS_WITHOUT_KIT,
  kitDemandOf,
  PEOPLE_GROUP_LABEL,
  type PeopleGroupRow,
  stockBalance,
  sumRows,
  toDeliver,
  visibleRows,
} from "@/domain/kit-comparison";
import { KIT_KIND_LABEL, KIT_KINDS, type KitCounts, type KitKind, type KitPlan, kitPlanTotals, formatCents, linesFor } from "@/domain/kit-plan";
import { AFFILIATION_STATUS_SHORT, AFFILIATION_STATUS_TONE, CHECK_IN_METHOD_LABEL, EMPLOYEE_CATEGORY_LABEL, KIT_TYPE_LABEL, STOCK_MODE_LABEL, STOCK_POOL_LABEL } from "@/domain/labels";
import { REPORT_INFO, type ReportType } from "@/domain/reports";
import type { AffiliationStatus, CollaboratorCategory, GroupKitType, StockMode } from "@/domain/types";
import { maskCpf } from "@/lib/cpf";
import { formatPlainDate, formatShortDateTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { db } from "@/server/db";
import { type Cell, ReportPdf, type Tone } from "@/server/pdf/report";
import { allEntriesForExport, entrySummary, entryType } from "@/server/queries/entries";
import { type EmployeeRow, listEmployees } from "@/server/services/employees";
import { getKitCounts, getKitPlan } from "@/server/services/kit-plan";
import { listKitWaitlist } from "@/server/services/kit-waitlist";
import { getDashboardStats, getPeopleKitComparison } from "@/server/services/stats";

/*
 * O conteúdo de cada relatório em PDF: as mesmas contas das telas do painel,
 * em folha para imprimir ou mandar. CPF sempre mascarado; sem telefones.
 */

const n = (value: number) => value.toLocaleString("pt-BR");
const chip = (text: string, tone: Tone = "neutral"): Cell => ({ text, chip: true, tone });
const none: Cell = { text: "—", muted: true };

const STATUS_TONE: Record<string, Tone> = { success: "success", warning: "warning", danger: "danger", info: "neutral", neutral: "neutral" };

/** O modo do estoque, curto (cabe embaixo do número). */
const STOCK_MODE_SHORT: Record<StockMode, string> = {
  UNIFIED: "Estoque único para todos",
  SINGLE: "Geral + colaboradores",
  SPLIT: "Separado por tipo de kit",
};
const statusChip = (status: AffiliationStatus): Cell => chip(AFFILIATION_STATUS_SHORT[status], STATUS_TONE[AFFILIATION_STATUS_TONE[status]] ?? "neutral");

/** O que o relatório precisa saber da festa e de quem pediu (a rota monta a partir das configurações). */
export interface ReportContext {
  eventName: string;
  /** "Sexta-feira, 16 de outubro de 2026 · 19h às 2h" */
  eventLine: string;
  kitDeadline: { label: string; passed: boolean } | null;
  eventStart: Date | null;
  generatedBy: string;
}

export async function buildReport(type: ReportType, context: ReportContext): Promise<Uint8Array> {
  const info = REPORT_INFO[type];
  const report = await ReportPdf.create({
    title: info.title,
    kicker: info.kicker,
    eventName: context.eventName,
    eventLine: context.eventLine,
    generatedBy: context.generatedBy,
    generatedAt: new Date(),
  });
  switch (type) {
    case "kits":
      await kitsReport(report, context.kitDeadline);
      break;
    case "inscricoes":
      await registrationsReport(report);
      break;
    case "colaboradores":
      await collaboratorsReport(report);
      break;
    case "cortesias":
      await courtesiesReport(report);
      break;
    case "fichas":
      await formsReport(report);
      break;
    case "entradas":
      await entriesReport(report, context.eventStart);
      break;
  }
  return report.finish();
}

// ——— Kits e estoque ———

function kitGroupRow(row: PeopleGroupRow): Cell[] {
  const withoutKit = GROUPS_WITHOUT_KIT.includes(row.id) && row.delivered === 0;
  return [
    { text: PEOPLE_GROUP_LABEL[row.id], bold: true },
    n(row.people),
    withoutKit ? chip("sem kit") : n(row.withKit),
    withoutKit || !row.pending ? none : n(row.pending),
    row.waitlist ? { text: n(row.waitlist), tone: "warning", bold: true } : none,
    withoutKit ? none : n(row.delivered),
    withoutKit ? none : n(toDeliver(row)),
    n(row.present),
  ];
}

function addCounts(a: KitCounts, b: KitCounts): KitCounts {
  const kits = Object.fromEntries(KIT_KINDS.map((kind) => [kind, a.kits[kind] + b.kits[kind]])) as Record<KitKind, number>;
  const minors = Object.fromEntries(KIT_KINDS.map((kind) => [kind, a.minors[kind] + b.minors[kind]])) as Record<KitKind, number>;
  return { kits, minors };
}

function describeLines(plan: KitPlan, lines: { itemId: string; quantity: number }[]): string {
  const names = lines
    .filter((line) => line.quantity > 0)
    .map((line) => {
      const item = plan.items.find((candidate) => candidate.id === line.itemId);
      return item ? `${line.quantity} ${item.name}` : null;
    })
    .filter(Boolean);
  return names.length ? names.join(" · ") : "Nada (kit vazio)";
}

async function kitsReport(report: ReportPdf, deadline: ReportContext["kitDeadline"]) {
  const [stats, comparison, queue, plan, counts, deliveries] = await Promise.all([
    getDashboardStats(db),
    getPeopleKitComparison(db),
    listKitWaitlist(db),
    getKitPlan(db),
    getKitCounts(db),
    db.execute<{ kind: KitKind; delivered: number; cancelled: number }>(sql`
      SELECT CASE
               WHEN kd.kit_type = 'EMPLOYEE' AND e.category = 'COURTESY' THEN 'COURTESY'
               WHEN kd.kit_type = 'GUEST' AND kd.employee_id IS NOT NULL THEN 'EMPLOYEE_GUEST'
               ELSE kd.kit_type::text
             END AS kind,
             count(*) FILTER (WHERE kd.cancelled_at IS NULL)::int AS delivered,
             count(*) FILTER (WHERE kd.cancelled_at IS NOT NULL)::int AS cancelled
        FROM kit_delivery kd
        LEFT JOIN employee e ON e.id = kd.employee_id
       GROUP BY 1
    `),
  ]);
  const stock = stats.stock;
  const demand = kitDemandOf(comparison);
  const planned = demand.member + demand.guest + demand.employee;
  const balances = stockBalance(
    (stock?.pools ?? []).map((pool) => ({ pool: pool.pool, total: pool.total })),
    demand,
    stock?.mode,
  );
  const totals = sumRows([...comparison.registrations, ...comparison.house]);
  const waiting = stats.kitWaitlist.member + stats.kitWaitlist.guest;

  report.stats([
    { label: "Estoque cadastrado", value: n(stock?.totalStock ?? 0), hint: stock ? STOCK_MODE_SHORT[stock.mode] : "Não cadastrado" },
    {
      label: "Kits previstos",
      value: n(planned),
      hint: totals.pending ? `${n(totals.pending)} ${totals.pending === 1 ? "depende" : "dependem"} de conferência` : "Todos já garantidos",
    },
    { label: "Já entregues", value: n(stock?.totalDelivered ?? totals.delivered), tone: "success", hint: `Faltam sair ${n(totals.toDeliver)}` },
    { label: "Fila do kit", value: n(waiting), tone: waiting ? "warning" : undefined, hint: waiting ? "Saem se vagar kit" : "Ninguém esperando" },
  ]);

  for (const balance of balances) {
    const label = STOCK_POOL_LABEL[balance.pool].toLowerCase();
    if (balance.balance < 0) {
      report.callout(`Faltam ${n(-balance.balance)} kits em ${label}: ${n(balance.total)} cadastrados para ${n(balance.planned)} previstos. Quem se inscrever agora entra na fila do kit.`, "danger");
    }
  }
  if (balances.length && balances.every((balance) => balance.balance >= 0)) {
    const left = balances.reduce((sum, balance) => sum + balance.balance, 0);
    report.callout(`O estoque cobre todos os kits previstos${left ? `: sobram ${n(left)}` : " (na conta exata)"}.`, "success");
  }
  if (deadline) {
    report.callout(
      deadline.passed
        ? `Sobras liberadas desde as ${deadline.label}: quem entra leva kit enquanto houver, inclusive quem estava na fila.`
        : `Kits guardados até as ${deadline.label} para quem se inscreveu. Depois, as sobras saem na entrada, por ordem de chegada.`,
      "neutral",
    );
  }

  report.section("Estoque", stock ? `${STOCK_MODE_LABEL[stock.mode]}. Alerta quando restarem até ${n(stock.threshold)} kits.` : "Estoque ainda não cadastrado.");
  report.table(
    [
      { header: "Estoque", width: 3 },
      { header: "Cadastrado", width: 1.3, align: "right" },
      { header: "Previstos", width: 1.3, align: "right" },
      { header: "Saldo", width: 1.6, align: "center" },
      { header: "Entregues", width: 1.3, align: "right" },
      { header: "Na prateleira", width: 1.5, align: "right" },
    ],
    (stock?.pools ?? []).map((pool) => {
      const balance = balances.find((item) => item.pool === pool.pool);
      return [
        { text: STOCK_POOL_LABEL[pool.pool], bold: true, sub: pool.low ? "Estoque baixo" : undefined },
        n(pool.total),
        n(balance?.planned ?? 0),
        balance ? (balance.balance >= 0 ? chip(`sobram ${n(balance.balance)}`, "success") : chip(`faltam ${n(-balance.balance)}`, "danger")) : none,
        n(pool.delivered),
        { text: n(pool.available), bold: true },
      ];
    }),
    { empty: "Estoque não cadastrado (Kits e estoque → Quantidades)." },
  );

  report.section("Pessoas e kits", "Quem vem, quem tem direito a kit, o que já saiu e o que falta sair. Quem aguarda conferência ganha o kit quando a filiação for confirmada.");
  const groupColumns = [
    { header: "Grupo", width: 3.2 },
    { header: "Pessoas", width: 1, align: "right" as const },
    { header: "Com kit", width: 1, align: "right" as const },
    { header: "A confirmar", width: 1.2, align: "right" as const },
    { header: "Fila", width: 0.8, align: "right" as const },
    { header: "Entregues", width: 1.1, align: "right" as const },
    { header: "Faltam", width: 1, align: "right" as const },
    { header: "Entraram", width: 1.1, align: "right" as const },
  ];
  const waitlistTotal = [...comparison.registrations, ...comparison.house].reduce((sum, row) => sum + (row.waitlist ?? 0), 0);
  report.table(groupColumns, [...visibleRows(comparison.registrations), ...visibleRows(comparison.house)].map(kitGroupRow), {
    total: [
      "Total",
      n(totals.people),
      n(totals.withKit),
      totals.pending ? n(totals.pending) : "—",
      waitlistTotal ? n(waitlistTotal) : "—",
      n(totals.delivered),
      n(totals.toDeliver),
      n(totals.present),
    ],
  });
  if (comparison.rejected) report.paragraph(`Fora da conta: ${plural(comparison.rejected, "inscrição", "inscrições")} com filiação não confirmada.`, { size: 8.5 });

  if (plan && plan.items.length) {
    const forecast = kitPlanTotals(plan, counts.forecast);
    const withQueue = kitPlanTotals(plan, addCounts(counts.forecast, counts.waitlist));
    const delivered = kitPlanTotals(plan, counts.delivered);
    report.section("Montagem e custo", forecast.missingPrice ? "Algum item está sem preço: o total em reais fica incompleto." : "Quanto custa a consumação, pelo que vem em cada kit.");
    report.stats([
      { label: "Custo previsto", value: formatCents(forecast.totalCents), hint: plural(forecast.kits, "kit", "kits") },
      { label: "Se a fila ganhar kit", value: formatCents(withQueue.totalCents), hint: plural(withQueue.kits, "kit", "kits"), tone: withQueue.kits > forecast.kits ? "warning" : undefined },
      { label: "Já saiu", value: formatCents(delivered.totalCents), hint: plural(delivered.kits, "kit", "kits"), tone: "success" },
    ]);
    report.table(
      [
        { header: "Tipo de kit", width: 2.6 },
        { header: "O que vem", width: 4.2 },
        { header: "Kits", width: 0.9, align: "right" },
        { header: "Custo do kit", width: 1.4, align: "right" },
        { header: "Subtotal", width: 1.5, align: "right" },
      ],
      [
        ...forecast.kinds
          .filter((kind) => kind.kits > 0 || kind.kind === "MEMBER")
          .map((kind): Cell[] => [
            { text: KIT_KIND_LABEL[kind.kind], bold: true, sub: kind.minors ? `${n(kind.minors)} de menor de 18` : undefined },
            { text: describeLines(plan, linesFor(plan, kind.kind)) },
            n(kind.kits),
            kind.minorUnitCents !== null && kind.minors ? { text: formatCents(kind.unitCents), sub: `menor: ${formatCents(kind.minorUnitCents)}` } : formatCents(kind.unitCents),
            { text: formatCents(kind.subtotalCents), bold: true },
          ]),
        ...(plan.minor ? [[{ text: "Menor de 18", bold: true }, describeLines(plan, plan.minor), none, none, none] as Cell[]] : []),
      ],
      { total: ["Total", "", n(forecast.kits), "", formatCents(forecast.totalCents)] },
    );
    report.subheading("Lista de compras", "para os kits previstos");
    report.table(
      [
        { header: "Item", width: 4 },
        { header: "Quantidade", width: 1.4, align: "right" },
        { header: "Preço", width: 1.4, align: "right" },
        { header: "Custo", width: 1.6, align: "right" },
      ],
      forecast.items.map((item): Cell[] => [
        { text: item.name, bold: true },
        n(item.quantity),
        item.priceCents === null ? { text: "sem preço", tone: "warning" } : formatCents(item.priceCents),
        formatCents(item.costCents),
      ]),
      { empty: "Nenhum item nos kits." },
    );
  }

  report.section("Fila do kit", "Inscrições feitas depois que os kits acabaram: o kit sai se vagar (por ordem), ou como sobra depois do horário dos kits guardados.");
  const shared = stock?.mode !== "SPLIT";
  const positions = new Map<string, number>();
  report.table(
    [
      { header: "Nº", width: 0.6, align: "right" },
      { header: "Pessoa", width: 4 },
      { header: "Kit", width: 2.2 },
      { header: "Na fila desde", width: 2 },
      { header: "Inscrição", width: 1.8, align: "center" },
    ],
    queue.map((slot): Cell[] => {
      const line = shared ? "ALL" : slot.kitType;
      const position = (positions.get(line) ?? 0) + 1;
      positions.set(line, position);
      const guest = slot.kitType === "GUEST";
      return [
        { text: String(position).padStart(2, "0"), bold: true, tone: "warning" },
        guest ? { text: slot.guestName ?? "Convidado(a)", bold: true, sub: `convidado(a) de ${slot.memberName}` } : { text: slot.memberName, bold: true },
        KIT_TYPE_LABEL[slot.kitType as GroupKitType],
        formatShortDateTime(slot.since),
        statusChip(slot.status as AffiliationStatus),
      ];
    }),
    { empty: "Ninguém na fila do kit." },
  );

  report.section("Entregas registradas", "Cada entrada que solta kit baixa 1 do estoque da categoria da pessoa (ninguém registra retirada à parte).");
  const deliveryRows = KIT_KINDS.map((kind) => {
    const found = deliveries.rows.find((row) => row.kind === kind);
    return { kind, delivered: Number(found?.delivered ?? 0), cancelled: Number(found?.cancelled ?? 0) };
  }).filter(
    (row) => row.delivered || row.cancelled || row.kind === "MEMBER" || row.kind === "GUEST",
  );
  report.table(
    [
      { header: "Kit de", width: 4 },
      { header: "Entregues", width: 1.4, align: "right" },
      { header: "Estornados", width: 1.4, align: "right" },
    ],
    deliveryRows.map((row): Cell[] => [{ text: KIT_KIND_LABEL[row.kind], bold: true }, n(Number(row.delivered)), Number(row.cancelled) ? n(Number(row.cancelled)) : none]),
    { total: ["Total", n(deliveryRows.reduce((sum, row) => sum + Number(row.delivered), 0)), n(deliveryRows.reduce((sum, row) => sum + Number(row.cancelled), 0))] },
  );
}

// ——— Inscrições ———

type RegistrationReportRow = {
  full_name: string;
  cpf: string | null;
  status: AffiliationStatus;
  is_teacher: boolean;
  origin: string;
  member_kit_waitlisted_at: Date | null;
  guest_kit_waitlisted_at: Date | null;
  guest_name: string | null;
  guest_minor: boolean | null;
  member_in: Date | string | null;
  guest_in: Date | string | null;
  member_kit: boolean;
  guest_kit: boolean;
};

const ACTIVE: readonly AffiliationStatus[] = ["CONFIRMED", "JOINED_AT_EVENT"];

function kitCell(row: RegistrationReportRow, kind: GroupKitType): Cell {
  if (!row.is_teacher) return kind === "MEMBER" ? chip("Sem kit") : none;
  if (kind === "GUEST" && !row.guest_name && !row.guest_kit) return none;
  if (kind === "MEMBER" ? row.member_kit : row.guest_kit) return chip("Entregue", "success");
  if (row.status === "REJECTED") return none;
  if (kind === "MEMBER" ? row.member_kit_waitlisted_at : row.guest_kit_waitlisted_at) return chip("Fila do kit", "warning");
  if (!ACTIVE.includes(row.status)) return chip("A confirmar");
  return chip("Garantido");
}

const timeOf = (value: Date | string | null) => (value ? formatShortDateTime(value) : null);

async function registrationsReport(report: ReportPdf) {
  const result = await db.execute<RegistrationReportRow>(sql`
    SELECT p.full_name, p.cpf, r.status, r.is_teacher, r.origin,
           r.member_kit_waitlisted_at, r.guest_kit_waitlisted_at,
           gp.full_name AS guest_name, gp.is_minor AS guest_minor,
           (SELECT min(ci.checked_in_at) FROM check_in ci WHERE ci.person_id = p.id AND ci.cancelled_at IS NULL) AS member_in,
           (SELECT min(ci.checked_in_at) FROM check_in ci WHERE ci.person_id = gl.guest_person_id AND ci.cancelled_at IS NULL) AS guest_in,
           EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'MEMBER' AND kd.cancelled_at IS NULL) AS member_kit,
           EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL) AS guest_kit
      FROM registration r
      JOIN person p ON p.id = r.member_person_id
      LEFT JOIN guest_link gl ON gl.registration_id = r.id AND gl.status = 'ACTIVE'
      LEFT JOIN person gp ON gp.id = gl.guest_person_id
     ORDER BY p.search_name, p.id
  `);
  const rows = result.rows;
  const count = (status: AffiliationStatus) => rows.filter((row) => row.status === status).length;
  const teachers = rows.filter((row) => row.is_teacher && row.status !== "REJECTED").length;
  const guests = rows.filter((row) => row.guest_name).length;
  const entered = rows.filter((row) => row.member_in).length + rows.filter((row) => row.guest_in).length;
  const waitlisted = rows.filter((row) => row.member_kit_waitlisted_at).length + rows.filter((row) => row.guest_kit_waitlisted_at).length;

  report.stats([
    { label: "Inscrições", value: n(rows.length), hint: `${n(teachers)} de professoras e professores` },
    { label: "Confirmadas", value: n(count("CONFIRMED") + count("JOINED_AT_EVENT")), tone: "success", hint: count("JOINED_AT_EVENT") ? `${n(count("JOINED_AT_EVENT"))} pela ficha` : undefined },
    { label: "Para conferir", value: n(count("PENDING")), tone: count("PENDING") ? "warning" : undefined, hint: count("AWAITING_SIGNATURE") ? `+ ${plural(count("AWAITING_SIGNATURE"), "ficha", "fichas")} para assinar` : undefined },
    { label: "Não confirmadas", value: n(count("REJECTED")), tone: count("REJECTED") ? "danger" : undefined, hint: "Fora da conta dos kits" },
    { label: "Convidados", value: n(guests), hint: "1 por professor(a)" },
    { label: "Já entraram", value: n(entered), tone: entered ? "success" : undefined, hint: "Inscritos e convidados" },
    { label: "Kits na fila", value: n(waitlisted), tone: waitlisted ? "warning" : undefined, hint: "Inscrições depois que acabaram" },
  ]);

  report.section("Lista de inscrições", "Em ordem alfabética. A inscrição é de quem é filiado(a); o convidado aparece ao lado.");
  report.table(
    [
      { header: "Quem se inscreveu", width: 3.6 },
      { header: "Situação", width: 1.7, align: "center" },
      { header: "Kit", width: 1.5, align: "center" },
      { header: "Convidado(a)", width: 2.8 },
      { header: "Kit conv.", width: 1.5, align: "center" },
      { header: "Entrada", width: 1.7 },
    ],
    rows.map((row): Cell[] => [
      { text: row.full_name, bold: true, sub: `${row.cpf ? `CPF ${maskCpf(row.cpf)}` : "Sem CPF"} · ${row.is_teacher ? "professor(a)" : "filiado(a)"}` },
      statusChip(row.status),
      kitCell(row, "MEMBER"),
      row.guest_name ? { text: row.guest_name, sub: row.guest_minor ? "menor de 18" : undefined } : none,
      kitCell(row, "GUEST"),
      {
        text: timeOf(row.member_in) ?? "—",
        muted: !row.member_in,
        sub: row.guest_name ? `conv.: ${timeOf(row.guest_in) ?? "não entrou"}` : undefined,
      },
    ]),
    { empty: "Nenhuma inscrição ainda." },
  );
}

// ——— Colaboradores e cortesias ———

function employeeKitCell(row: EmployeeRow): Cell {
  if (!row.withKit) return chip("Sem kit");
  return row.kitDeliveredAt ? chip("Entregue", "success") : chip("Sai na entrada");
}

function entryCell(checkedInAt: Date | null, sub?: string): Cell {
  return { text: checkedInAt ? formatShortDateTime(checkedInAt) : "—", muted: !checkedInAt, sub };
}

const CATEGORY_GROUP: Record<CollaboratorCategory, string> = {
  BOARD: "Diretoria",
  STAFF: "Funcionárias e funcionários",
  CONTRACTOR: "Prestadores de serviço",
};

function removedTable(report: ReportPdf, rows: EmployeeRow[], withCategory: boolean) {
  if (!rows.length) return;
  report.section("Fora da lista", "Tirados da lista pela organização: o voucher não vale mais.");
  report.table(
    [
      { header: "Nome", width: 4 },
      ...(withCategory ? [{ header: "Categoria", width: 2.2 }] : []),
      { header: "Saiu da lista", width: 2.2 },
    ],
    rows.map((row): Cell[] => [
      { text: row.fullName, bold: true },
      ...(withCategory ? [EMPLOYEE_CATEGORY_LABEL[row.category]] : []),
      row.removedAt ? formatShortDateTime(row.removedAt) : "—",
    ]),
  );
}

async function collaboratorsReport(report: ReportPdf) {
  const rows = await listEmployees(db, { kind: "collaborators", includeRemoved: true });
  const active = rows.filter((row) => !row.removedAt);
  const withGuest = active.filter((row) => row.guest).length;
  const entered = active.filter((row) => row.checkedInAt).length + active.filter((row) => row.guest?.checkedInAt).length;
  const kits = active.filter((row) => row.kitDeliveredAt).length + active.filter((row) => row.guest?.kitDeliveredAt).length;
  const byCategory = (category: CollaboratorCategory) => active.filter((row) => row.category === category);

  report.stats([
    {
      label: "Na lista",
      value: n(active.length),
      hint: (["BOARD", "STAFF", "CONTRACTOR"] as const).map((category) => `${n(byCategory(category).length)} ${CATEGORY_GROUP[category].split(" ")[0]!.toLowerCase()}`).join(" · "),
    },
    { label: "Com convidado", value: n(withGuest), hint: "1 convidado cada, com kit" },
    { label: "Kits previstos", value: n(active.length + withGuest), hint: plural(kits, "já entregue", "já entregues"), tone: kits ? "success" : undefined },
    { label: "Já entraram", value: n(entered), tone: entered ? "success" : undefined, hint: "Colaboradores e convidados" },
  ]);

  for (const category of ["BOARD", "STAFF", "CONTRACTOR"] as const) {
    const group = byCategory(category);
    if (!group.length) continue;
    report.section(CATEGORY_GROUP[category], plural(group.length, "pessoa", "pessoas"));
    report.table(
      [
        { header: "Nome", width: 3.4 },
        { header: "Kit", width: 1.5, align: "center" },
        { header: "Convidado(a)", width: 3 },
        { header: "Kit conv.", width: 1.5, align: "center" },
        { header: "Entrada", width: 1.9 },
      ],
      group.map((row): Cell[] => [
        { text: row.fullName, bold: true, sub: row.jobTitle ?? undefined },
        employeeKitCell(row),
        row.guest ? { text: row.guest.fullName } : none,
        row.guest ? (row.guest.kitDeliveredAt ? chip("Entregue", "success") : chip("Sai na entrada")) : none,
        entryCell(row.checkedInAt, row.guest ? `conv.: ${row.guest.checkedInAt ? formatShortDateTime(row.guest.checkedInAt) : "não entrou"}` : undefined),
      ]),
    );
  }
  removedTable(report, rows.filter((row) => row.removedAt), true);
}

async function courtesiesReport(report: ReportPdf) {
  const all = await listEmployees(db, { kind: "all", includeRemoved: true });
  const nameOf = new Map(all.map((row) => [row.employeeId, row.fullName]));
  const rows = all.filter((row) => row.category === "COURTESY");
  const active = rows.filter((row) => !row.removedAt);
  const withKit = active.filter((row) => row.withKit).length;
  const entered = active.filter((row) => row.checkedInAt).length;

  report.stats([
    { label: "Cortesias", value: n(active.length), hint: "Convites da organização" },
    { label: "Com kit", value: n(withKit), hint: `${plural(active.filter((row) => row.kitDeliveredAt).length, "já entregue", "já entregues")}` },
    { label: "Sem kit", value: n(active.length - withKit), hint: "Inclui convidados sem kit" },
    { label: "Já entraram", value: n(entered), tone: entered ? "success" : undefined },
  ]);

  const groups = new Map<string, EmployeeRow[]>();
  for (const row of active) {
    const key = row.jobTitle ?? "";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a ? (b ? a.localeCompare(b, "pt-BR") : -1) : 1));
  if (!ordered.length) report.paragraph("Nenhuma cortesia cadastrada.", { color: undefined });
  for (const [inviter, group] of ordered) {
    report.section(inviter ? `Convite: ${inviter}` : "Sem indicação de quem convidou", plural(group.length, "pessoa", "pessoas"));
    report.table(
      [
        { header: "Nome", width: 4.4 },
        { header: "Kit", width: 1.6, align: "center" },
        { header: "Entrada", width: 2 },
      ],
      group.map((row): Cell[] => [
        {
          text: row.fullName,
          bold: true,
          sub: [row.hostEmployeeId ? `veio com ${nameOf.get(row.hostEmployeeId) ?? "colaborador(a)"}` : null, row.isMinor ? "menor de 18" : null].filter(Boolean).join(" · ") || undefined,
        },
        employeeKitCell(row),
        entryCell(row.checkedInAt),
      ]),
    );
  }
  removedTable(report, rows.filter((row) => row.removedAt), false);
}

// ——— Fichas de filiação ———

type FormReportRow = {
  full_name: string;
  cpf: string;
  status: "DRAFT" | "FORMALIZED" | "CANCELLED";
  origin: "PUBLIC" | "STAFF";
  is_teacher: boolean;
  workplace: string;
  form_date: string;
  formalized_at: Date | string | null;
  rg: number;
  payslip: number;
  signed: number;
};

async function formsReport(report: ReportPdf) {
  const result = await db.execute<FormReportRow>(sql`
    SELECT f.full_name, f.cpf, f.status, f.origin, f.is_teacher, f.workplace, f.form_date, f.formalized_at,
           count(d.id) FILTER (WHERE d.kind = 'RG')::int AS rg,
           count(d.id) FILTER (WHERE d.kind = 'PAYSLIP')::int AS payslip,
           count(d.id) FILTER (WHERE d.kind = 'SIGNED_FORM')::int AS signed
      FROM affiliation_form f
      LEFT JOIN affiliation_document d ON d.form_id = f.id
     GROUP BY f.id
     ORDER BY f.full_name, f.id
  `);
  const rows = result.rows;
  const drafts = rows.filter((row) => row.status === "DRAFT");
  const missingDocs = drafts.filter((row) => !Number(row.rg) || !Number(row.payslip)).length;
  const signedGov = drafts.filter((row) => Number(row.signed)).length;

  report.stats([
    { label: "Fichas", value: n(rows.filter((row) => row.status !== "CANCELLED").length), hint: `${n(rows.filter((row) => row.origin === "PUBLIC").length)} pelo site` },
    { label: "Para assinar", value: n(drafts.length), tone: drafts.length ? "warning" : undefined, hint: signedGov ? `${n(signedGov)} já com a do gov.br` : undefined },
    { label: "Assinadas", value: n(rows.filter((row) => row.status === "FORMALIZED").length), tone: "success" },
    { label: "Faltam documentos", value: n(missingDocs), tone: missingDocs ? "danger" : undefined, hint: "RG e contracheque" },
  ]);
  report.callout("A assinatura só é confirmada com a cópia do RG e do contracheque anexadas (regra da filiação).", "neutral");

  report.section("Lista de fichas", "Em ordem alfabética.");
  report.table(
    [
      { header: "Nome", width: 3.8 },
      { header: "Origem", width: 1.3 },
      { header: "Situação", width: 1.6, align: "center" },
      { header: "Documentos", width: 2.6 },
      { header: "Data", width: 1.7 },
    ],
    rows.map((row): Cell[] => {
      const present = [Number(row.rg) ? "RG" : null, Number(row.payslip) ? "contracheque" : null, Number(row.signed) ? "ficha do gov.br" : null].filter(Boolean);
      const missing = [Number(row.rg) ? null : "RG", Number(row.payslip) ? null : "contracheque"].filter(Boolean);
      return [
        { text: row.full_name, bold: true, sub: `CPF ${maskCpf(row.cpf)} · ${row.workplace}` },
        row.origin === "PUBLIC" ? "Site" : "Atendimento",
        row.status === "DRAFT" ? chip("Para assinar", "warning") : row.status === "FORMALIZED" ? chip("Assinada", "success") : chip("Cancelada"),
        {
          text: present.length ? present.join(" · ") : "nenhum",
          muted: !present.length,
          sub: row.status === "DRAFT" && missing.length ? `falta ${missing.join(" e ")}` : undefined,
        },
        { text: formatPlainDate(row.form_date), sub: row.formalized_at ? `assinada ${formatShortDateTime(row.formalized_at)}` : undefined },
      ];
    }),
    { empty: "Nenhuma ficha ainda." },
  );
}

// ——— Entradas ———

async function entriesReport(report: ReportPdf, eventStart: Date | null) {
  const [rows, summary, stats] = await Promise.all([allEntriesForExport(), entrySummary(eventStart), getDashboardStats(db)]);
  const valid = rows.filter((row) => !row.cancelledAt);
  const cancelled = rows.filter((row) => row.cancelledAt);
  const kits = valid.reduce((sum, row) => sum + row.kitsAtEntry, 0);

  report.stats([
    { label: "Entraram", value: n(summary.total), tone: summary.total ? "success" : undefined, hint: `de ${n(stats.expected)} esperados` },
    { label: "Kits na entrada", value: n(kits), hint: "Saíram junto com as entradas" },
    { label: "Antes do horário", value: n(summary.early), tone: summary.early ? "warning" : undefined, hint: "Com a confirmação a mais" },
    { label: "Estornadas", value: n(summary.cancelled), tone: summary.cancelled ? "danger" : undefined, hint: "Desfeitas por correção" },
  ]);
  report.paragraph(
    `Como entraram: ${n(summary.byMethod.QR)} pelo QR Code · ${n(summary.byMethod.SEARCH)} pela busca · ${n(summary.byMethod.CODE)} pelo código do voucher.`,
    { size: 8.8 },
  );

  if (summary.operators.length) {
    report.section("Placar da portaria", "Quem registrou quantas entradas.");
    report.table(
      [
        { header: "Quem registrou", width: 5 },
        { header: "Entradas", width: 1.4, align: "right" },
      ],
      summary.operators.map((operator): Cell[] => [{ text: operator.name, bold: true }, n(operator.total)]),
    );
  }

  report.section("Entradas", "Em ordem de chegada.");
  report.table(
    [
      { header: "Hora", width: 1.7 },
      { header: "Pessoa", width: 4 },
      { header: "Como", width: 1.5 },
      { header: "Registrou", width: 2.1 },
      { header: "Kits", width: 0.8, align: "right" },
    ],
    valid.map((row): Cell[] => [
      { text: formatShortDateTime(row.checkedInAt), sub: eventStart && row.checkedInAt < eventStart ? "antes do horário" : undefined },
      { text: row.fullName, bold: true, sub: `${entryType(row)}${row.role === "GUEST" && row.hostName ? ` de ${row.hostName}` : ""}` },
      CHECK_IN_METHOD_LABEL[row.method],
      row.byName,
      row.kitsAtEntry ? { text: n(row.kitsAtEntry), bold: true, tone: "success" } : none,
    ]),
    { empty: "Ninguém entrou ainda." },
  );

  if (cancelled.length) {
    report.section("Entradas estornadas", "Desfeitas por correção (ficam na auditoria).");
    report.table(
      [
        { header: "Pessoa", width: 3.4 },
        { header: "Entrada", width: 1.8 },
        { header: "Estorno", width: 2.4 },
        { header: "Motivo", width: 2.8 },
      ],
      cancelled.map((row): Cell[] => [
        { text: row.fullName, bold: true, sub: entryType(row) },
        formatShortDateTime(row.checkedInAt),
        { text: row.cancelledAt ? formatShortDateTime(row.cancelledAt) : "—", sub: row.cancelledByName ?? undefined },
        row.cancelReason ?? "—",
      ]),
    );
  }
}
