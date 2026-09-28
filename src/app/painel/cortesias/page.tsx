import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Gift, Heart, Login, Pencil, Printer, QrCode, Reload, Trash, Warning } from "@/components/icons/pixel";
import { CATEGORY_AVATAR } from "@/components/staff/category-avatar";
import { BulkEmployeesDialog, CourtesyDialog, EditEmployeeDialog } from "@/components/staff/employee-dialogs";
import { ChipFilters, EmptyState, PageHeader, StatTile } from "@/components/staff/panel-ui";
import { ShareCourtesyVouchersButton } from "@/components/staff/share-courtesy-vouchers";
import { ToneBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/access";
import { formatCpf } from "@/lib/cpf";
import { formatTime } from "@/lib/datetime";
import { maskPhoneInput } from "@/lib/phone";
import { plural } from "@/lib/plural";
import { initials } from "@/lib/text";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { removeEmployeeAction, restoreEmployeeAction } from "@/server/actions/employees";
import { APP_NAME, getConfig } from "@/server/queries/config";
import { loadVoucherForStaff } from "@/server/queries/vouchers";
import { type EmployeeRow, listEmployees } from "@/server/services/employees";
import { getStockOverview } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Cortesias" };

const FILTERS = {
  "": "Todas",
  fora: "Ainda não entraram",
  dentro: "Já entraram",
  removidos: "Tiradas da lista",
} as const;

/** Nome do grupo de quem não disse quem convidou. */
const NO_INVITER = "Sem indicação";

/**
 * Cortesias da organização: amigos, familiares e convidados da diretoria, dos
 * funcionários e dos prestadores. Cada pessoa tem voucher próprio e 1 kit (do
 * estoque dos colaboradores), sem convidado. A lista vem agrupada por quem
 * convidou, com um botão para mandar os vouchers do grupo numa mensagem só.
 */
export default async function CourtesiesPage({ searchParams }: PageProps<"/painel/cortesias">) {
  const actor = await requirePageActor("viewEmployees");
  const canManage = can(actor.access, "manageEmployees");
  const query = await searchParams;
  const filterParam = typeof query.filtro === "string" ? query.filtro : "";
  const filter = (Object.hasOwn(FILTERS, filterParam) ? filterParam : "") as keyof typeof FILTERS;
  const [everyone, stock, config] = await Promise.all([listEmployees(db, { includeRemoved: true, kind: "all" }), getStockOverview(db), getConfig()]);
  const eventName = config?.name ?? APP_NAME;

  const all = everyone.filter((row) => row.category === "COURTESY");
  const active = all.filter((row) => !row.removedAt);
  const present = active.filter((row) => row.checkedInAt);
  const kitsDelivered = active.filter((row) => row.kitDeliveredAt).length;
  // O estoque é o mesmo dos colaboradores: a previsão soma todo mundo que tira kit dele.
  const collaborators = everyone.filter((row) => row.category !== "COURTESY" && !row.removedAt);
  const kitsNeeded = collaborators.length + collaborators.filter((row) => row.guest).length + active.length;
  const employeePool = stock?.pools.find((pool) => pool.pool === "EMPLOYEE") ?? null;
  const inviters = [...new Set(all.map((row) => row.jobTitle).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const rows =
    filter === "removidos"
      ? all.filter((row) => row.removedAt)
      : filter === "dentro"
        ? present
        : filter === "fora"
          ? active.filter((row) => !row.checkedInAt)
          : active;
  const groups = groupByInviter(rows);
  // Links dos vouchers de quem ainda vale (botão de mandar no WhatsApp). Quem vê a lista já pode abrir
  // e mandar cada voucher, então o botão do grupo vale também para quem só vê.
  const tokens = new Map<string, string>();
  const cards = await Promise.all(rows.filter((row) => !row.removedAt).map((row) => loadVoucherForStaff(row.personId)));
  for (const card of cards) if (card) tokens.set(card.personId, card.token);

  return (
    <div>
      <PageHeader
        eyebrow="Convites da organização"
        title="Cortesias"
        description="Amigos, familiares e convidados da diretoria, dos funcionários e dos prestadores: cada pessoa tem voucher próprio e 1 kit de consumação, que sai junto com a entrada (do estoque dos colaboradores). Cortesia não leva convidado: cadastre cada pessoa."
        actions={
          <>
            {canManage ? (
              <>
                <CourtesyDialog inviters={inviters} />
                <BulkEmployeesDialog courtesy inviters={inviters} />
              </>
            ) : null}
            {active.length > 0 ? (
              <Button asChild variant="outline">
                <Link href="/painel/cortesias/vouchers" data-testid="print-courtesies">
                  <Printer /> Imprimir vouchers
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Cortesias"
          value={active.length}
          icon={Heart}
          tone="brand"
          hint={inviters.length ? plural(inviters.length, "convite", "convites") : undefined}
          testId="stat-courtesies"
        />
        <StatTile label="Já entraram" value={present.length} icon={Login} tone="success" testId="stat-courtesies-present" />
        <StatTile label="Kits entregues" value={kitsDelivered} icon={Gift} tone="warning" hint={active.length ? `de ${active.length}` : undefined} testId="stat-courtesy-kits" />
        <StatTile
          label="Estoque dos colaboradores"
          value={employeePool?.available ?? 0}
          icon={Gift}
          tone={!employeePool || employeePool.low ? "danger" : "neutral"}
          href="/painel/kits"
          hint="O mesmo das cortesias"
          testId="stat-courtesy-stock"
        />
      </div>

      {kitsNeeded > 0 && (!employeePool || employeePool.total < kitsNeeded) ? (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-sm font-semibold text-fg" data-testid="courtesy-stock-warning">
          <Warning className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            {employeePool
              ? `O estoque dos colaboradores (${employeePool.total}) é menor que os kits previstos: ${plural(active.length, "cortesia", "cortesias")} + colaboradores e convidados deles = ${kitsNeeded}.`
              : `Nenhum kit cadastrado no estoque dos colaboradores: são previstos ${kitsNeeded} (cortesias + colaboradores e convidados deles).`}{" "}
            <Link href="/painel/kits" className="underline underline-offset-4">
              Ajustar em Kits e estoque
            </Link>
          </span>
        </p>
      ) : null}

      <ChipFilters
        basePath="/painel/cortesias"
        current={filter}
        params={{}}
        options={(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((value) => ({
          value,
          label: FILTERS[value],
          count:
            value === "removidos"
              ? all.length - active.length
              : value === "dentro"
                ? present.length
                : value === "fora"
                  ? active.length - present.length
                  : active.length,
        }))}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Heart} title={filter ? "Ninguém aqui" : "Nenhuma cortesia ainda"}>
          {filter
            ? "Nenhuma cortesia neste filtro."
            : canManage
              ? "Cadastre amigos, familiares e convidados da organização, uma por uma (a família entra em sequência) ou colando a lista."
              : "Quem administra o sistema cadastra as cortesias aqui."}
        </EmptyState>
      ) : (
        <div className="space-y-5" data-testid="courtesy-groups">
          {groups.map((group) => {
            const shareable = group.rows
              .filter((row) => !row.removedAt && tokens.has(row.personId))
              .map((row) => ({ fullName: row.fullName, token: tokens.get(row.personId)! }));
            return (
              <section key={group.key} className="space-y-2" data-testid="courtesy-group">
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <Heart className="size-4 text-[#ff8fd0]" />
                  <h2 className="pixel text-[0.6rem] text-fg" data-testid="courtesy-group-title">
                    {group.inviter ? `Convite: ${group.inviter}` : NO_INVITER}
                  </h2>
                  <span className="pixel text-[0.5rem] text-fg-dim tabular">· {plural(group.rows.length, "pessoa", "pessoas")}</span>
                  <span aria-hidden className="h-px min-w-6 flex-1 bg-line" />
                  {filter !== "removidos" ? <ShareCourtesyVouchersButton inviter={group.inviter} people={shareable} eventName={eventName} /> : null}
                </div>
                <div className="overflow-hidden rounded-xl border border-[#ff4fb4]/25 bg-surface">
                  <ul className="divide-y divide-line">
                    {group.rows.map((row) => (
                      <CourtesyItem key={row.employeeId} row={row} canManage={canManage} inviters={inviters} />
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function groupByInviter(rows: EmployeeRow[]) {
  const map = new Map<string, EmployeeRow[]>();
  for (const row of rows) {
    const key = row.jobTitle ?? "";
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "pt-BR")))
    .map(([key, groupRows]) => ({ key: key || "sem-indicacao", inviter: key || null, rows: groupRows }));
}

function CourtesyItem({ row, canManage, inviters }: { row: EmployeeRow; canManage: boolean; inviters: string[] }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5", row.removedAt && "opacity-60")} data-testid="courtesy-row">
      <span className={cn("pixel inline-flex size-10 shrink-0 items-center justify-center rounded-md text-[0.6rem]", CATEGORY_AVATAR.COURTESY)}>
        {initials(row.fullName)}
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/painel/participantes/${row.personId}`} className="font-bold text-fg hover:text-red hover:underline">
          {row.fullName}
        </Link>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {row.isMinor ? (
            <ToneBadge tone="warning" icon={Warning}>
              Menor de 18
            </ToneBadge>
          ) : null}
          {row.removedAt ? (
            <ToneBadge tone="danger">Tirada da lista</ToneBadge>
          ) : row.checkedInAt ? (
            <ToneBadge tone="success" icon={Login}>
              Entrou {formatTime(row.checkedInAt)}
            </ToneBadge>
          ) : (
            <ToneBadge tone="neutral">Não entrou</ToneBadge>
          )}
          {row.kitDeliveredAt ? (
            <ToneBadge tone="success" icon={Gift}>
              Kit {formatTime(row.kitDeliveredAt)}
            </ToneBadge>
          ) : null}
        </div>
      </div>
      {/* No celular, os botões ficam numa linha própria: o nome não espreme. */}
      <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
        {!row.removedAt ? (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/painel/participantes/${row.personId}/voucher`} aria-label={`Voucher de ${row.fullName}`}>
                <QrCode /> Voucher
              </Link>
            </Button>
            {canManage ? (
              <EditEmployeeDialog
                inviters={inviters}
                initial={{
                  employeeId: row.employeeId,
                  fullName: row.fullName,
                  cpf: row.cpf ? formatCpf(row.cpf) : "",
                  whatsapp: row.whatsapp ? maskPhoneInput(row.whatsapp) : "",
                  jobTitle: row.jobTitle ?? "",
                  category: row.category,
                  isMinor: row.isMinor,
                }}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Editar ${row.fullName}`}>
                    <Pencil />
                  </Button>
                }
              />
            ) : null}
            {canManage && !row.checkedInAt ? (
              <ConfirmActionDialog
                trigger={
                  <Button variant="ghost" size="icon-sm" className="text-fg-muted hover:text-danger" aria-label={`Tirar ${row.fullName} da lista`}>
                    <Trash />
                  </Button>
                }
                title={`Tirar ${row.fullName} da lista?`}
                description="O voucher deixa de valer na portaria. O histórico fica guardado e dá para trazer de volta."
                confirmLabel="Tirar da lista"
                tone="danger"
                onConfirm={removeEmployeeAction.bind(null, row.employeeId)}
                successMessage="Tirada da lista."
              />
            ) : null}
          </>
        ) : canManage ? (
          <ConfirmActionDialog
            trigger={
              <Button variant="outline" size="sm">
                <Reload /> Trazer de volta
              </Button>
            }
            title={`Trazer ${row.fullName} de volta?`}
            description="Volta para a lista com um voucher novo (o antigo continua cancelado)."
            confirmLabel="Trazer de volta"
            tone="success"
            onConfirm={restoreEmployeeAction.bind(null, row.employeeId)}
            successMessage="De volta à lista, com voucher novo."
          />
        ) : null}
      </div>
    </li>
  );
}
