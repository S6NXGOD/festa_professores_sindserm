import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Building, Gift, Login, Pencil, Printer, QrCode, Reload, Trash, Users, Warning } from "@/components/icons/pixel";
import { PlayerTag } from "@/components/retro/bits";
import { CategoryChip } from "@/components/staff/employee-category";
import { BulkEmployeesDialog, EditEmployeeDialog, EmployeeDialog } from "@/components/staff/employee-dialogs";
import { ChipFilters, EmptyState, PageHeader, StatTile } from "@/components/staff/panel-ui";
import { ToneBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/access";
import { employeeCategoryCount } from "@/domain/labels";
import { EMPLOYEE_CATEGORIES, type EmployeeCategory } from "@/domain/types";
import { formatCpf } from "@/lib/cpf";
import { formatTime } from "@/lib/datetime";
import { maskPhoneInput } from "@/lib/phone";
import { plural } from "@/lib/plural";
import { initials } from "@/lib/text";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { removeEmployeeAction, restoreEmployeeAction } from "@/server/actions/employees";
import { listEmployees } from "@/server/services/employees";
import { getStockOverview } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Colaboradores do SINDSERM" };

const FILTERS = {
  "": "Todos",
  fora: "Ainda não entraram",
  dentro: "Já entraram",
  removidos: "Tirados da lista",
} as const;

/** Iniciais no "metal" da categoria. */
const AVATAR: Record<EmployeeCategory, string> = {
  BOARD: "bg-[#e4e4e7] text-ink shadow-[0_3px_0_0_#71717a]",
  STAFF: "bg-warning text-warning-foreground shadow-[0_3px_0_0_#8a6a00]",
  CONTRACTOR: "bg-[#22d3ee] text-ink shadow-[0_3px_0_0_#0e7490]",
};

export default async function EmployeesPage({ searchParams }: PageProps<"/painel/colaboradores">) {
  const actor = await requirePageActor("viewEmployees");
  const canManage = can(actor.access, "manageEmployees");
  const query = await searchParams;
  const filterParam = typeof query.filtro === "string" ? query.filtro : typeof query.removidos === "string" ? "removidos" : "";
  const filter = (Object.hasOwn(FILTERS, filterParam) ? filterParam : "") as keyof typeof FILTERS;
  const categoryParam = typeof query.categoria === "string" ? query.categoria : "";
  const category = (EMPLOYEE_CATEGORIES as readonly string[]).includes(categoryParam) ? (categoryParam as EmployeeCategory) : null;
  const [all, stock] = await Promise.all([listEmployees(db, { includeRemoved: true }), getStockOverview(db)]);
  const active = all.filter((row) => !row.removedAt);
  const present = active.filter((row) => row.checkedInAt);
  const guests = active.filter((row) => row.guest);
  const guestsPresent = guests.filter((row) => row.guest?.checkedInAt).length;
  // Todo colaborador tem kit; o convidado dele também (os dois do estoque dos colaboradores).
  const kitsNeeded = active.length + guests.length;
  const employeePool = stock?.pools.find((pool) => pool.pool === "EMPLOYEE") ?? null;
  const byCategory = Object.fromEntries(EMPLOYEE_CATEGORIES.map((c) => [c, active.filter((row) => row.category === c).length])) as Record<
    EmployeeCategory,
    number
  >;
  const inStatus =
    filter === "removidos"
      ? all.filter((row) => row.removedAt)
      : filter === "dentro"
        ? present
        : filter === "fora"
          ? active.filter((row) => !row.checkedInAt)
          : active;
  const rows = category ? inStatus.filter((row) => row.category === category) : inStatus;
  const breakdown = EMPLOYEE_CATEGORIES.filter((c) => byCategory[c] > 0)
    .map((c) => employeeCategoryCount(c, byCategory[c]))
    .join(" · ");

  return (
    <div>
      <PageHeader
        eyebrow="Cadastro interno"
        title="Colaboradores do SINDSERM"
        description="Diretoria, funcionários e prestadores de serviço liberados para a festa: cada um tem voucher próprio (o passe da casa, com a categoria), 1 kit de consumação e pode levar 1 convidado com kit. Os kits saem do estoque dos colaboradores."
        actions={
          <>
            {canManage ? (
              <>
                <EmployeeDialog />
                <BulkEmployeesDialog />
              </>
            ) : null}
            {active.length > 0 ? (
              <Button asChild variant="outline">
                <Link href="/painel/colaboradores/vouchers" data-testid="print-badges">
                  <Printer /> Imprimir vouchers
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Liberados" value={active.length} icon={Building} tone="warning" hint={breakdown || undefined} testId="stat-employees" />
        <StatTile
          label="Já entraram"
          value={present.length}
          icon={Login}
          tone="success"
          hint={guests.length ? `+ ${guestsPresent} de ${plural(guests.length, "convidado", "convidados")}` : undefined}
          testId="stat-employees-present"
        />
        <StatTile label="Convidados" value={guests.length} icon={Users} tone="brand" testId="stat-employee-guests" />
        <StatTile
          label="Estoque dos colaboradores"
          value={employeePool?.available ?? 0}
          icon={Gift}
          tone={!employeePool || employeePool.low ? "danger" : "neutral"}
          href="/painel/kits"
          hint={employeePool ? `${employeePool.delivered} de ${employeePool.total} entregues` : "Cadastre em Kits e estoque"}
          testId="stat-employee-stock"
        />
      </div>

      {kitsNeeded > 0 && (!employeePool || employeePool.total < kitsNeeded) ? (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-sm font-semibold text-fg">
          <Warning className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            {employeePool
              ? `O estoque dos colaboradores (${employeePool.total}) é menor que os kits previstos: ${plural(active.length, "colaborador", "colaboradores")} + ${plural(guests.length, "convidado", "convidados")} = ${kitsNeeded}.`
              : `Nenhum kit cadastrado no estoque dos colaboradores: são previstos ${kitsNeeded} (colaboradores + convidados).`}{" "}
            <Link href="/painel/kits" className="underline underline-offset-4">
              Ajustar em Kits e estoque
            </Link>
          </span>
        </p>
      ) : null}

      <ChipFilters
        basePath="/painel/colaboradores"
        current={filter}
        params={{ categoria: category ?? undefined }}
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
      {/* Filtro de categoria: só aparece quando há mais de uma na lista. */}
      {EMPLOYEE_CATEGORIES.filter((c) => byCategory[c] > 0).length > 1 ? (
        <div className="no-scrollbar -mx-4 -mt-1 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" data-testid="category-filter">
          <Link
            href={filter ? `/painel/colaboradores?filtro=${filter}` : "/painel/colaboradores"}
            aria-current={!category ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md border-2 px-3 text-xs font-bold",
              !category ? "border-red bg-brand-soft text-fg" : "border-line-strong text-fg-muted hover:text-fg",
            )}
          >
            Todas as categorias
          </Link>
          {EMPLOYEE_CATEGORIES.filter((c) => byCategory[c] > 0).map((c) => (
            <Link
              key={c}
              href={`/painel/colaboradores?${new URLSearchParams({ ...(filter ? { filtro: filter } : {}), categoria: c }).toString()}`}
              aria-current={category === c ? "page" : undefined}
              className={cn("rounded-md outline-none", category === c ? "ring-2 ring-red ring-offset-2 ring-offset-ink" : "opacity-80 hover:opacity-100")}
            >
              <CategoryChip category={c} className="h-8" />
              <span className="sr-only">{byCategory[c]}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={Building} title={filter || category ? "Ninguém aqui" : "Ninguém liberado ainda"}>
          {filter || category
            ? "Nenhum colaborador neste filtro."
            : canManage
              ? "Libere um por um (já com o convidado) ou cole a lista inteira de uma vez — diretoria, funcionários e prestadores."
              : "Quem administra o sistema libera a diretoria, os funcionários e os prestadores de serviço aqui."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line" data-testid="employee-list">
            {rows.map((row) => (
              <li
                key={row.employeeId}
                className={cn("flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5", row.removedAt && "opacity-60")}
                data-testid="employee-row"
              >
                <span className={cn("pixel inline-flex size-10 shrink-0 items-center justify-center rounded-md text-[0.6rem]", AVATAR[row.category])}>
                  {initials(row.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/painel/participantes/${row.personId}`} className="font-bold text-fg hover:text-red hover:underline">
                    {row.fullName}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <CategoryChip category={row.category} />
                    {row.jobTitle ? <ToneBadge tone="neutral">{row.jobTitle}</ToneBadge> : null}
                    {row.removedAt ? (
                      <ToneBadge tone="danger">Tirado(a) da lista</ToneBadge>
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
                  {row.guest ? (
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm" data-testid="employee-guest">
                      <PlayerTag player={2} className="scale-90" />
                      <Link href={`/painel/participantes/${row.guest.personId}`} className="font-semibold text-fg hover:text-red hover:underline">
                        {row.guest.fullName}
                      </Link>
                      <span className="text-xs text-fg-muted">
                        {row.guest.checkedInAt ? `entrou ${formatTime(row.guest.checkedInAt)}` : "não entrou"}
                        {row.guest.kitDeliveredAt ? ` · kit ${formatTime(row.guest.kitDeliveredAt)}` : ""}
                      </span>
                    </p>
                  ) : null}
                </div>
                {/* No celular, os botões ficam numa linha própria: o nome não espreme. */}
                <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
                  {!row.removedAt ? (
                    <>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/painel/participantes/${row.personId}/voucher`} aria-label={`Vouchers de ${row.fullName}`}>
                          <QrCode /> {row.guest ? "Vouchers" : "Voucher"}
                        </Link>
                      </Button>
                      {canManage ? (
                        <EditEmployeeDialog
                          initial={{
                            employeeId: row.employeeId,
                            fullName: row.fullName,
                            cpf: row.cpf ? formatCpf(row.cpf) : "",
                            whatsapp: row.whatsapp ? maskPhoneInput(row.whatsapp) : "",
                            jobTitle: row.jobTitle ?? "",
                            category: row.category,
                          }}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${row.fullName}`}>
                              <Pencil />
                            </Button>
                          }
                        />
                      ) : null}
                      {canManage && !row.checkedInAt && !row.guest?.checkedInAt ? (
                        <ConfirmActionDialog
                          trigger={
                            <Button variant="ghost" size="icon-sm" className="text-fg-muted hover:text-danger" aria-label={`Tirar ${row.fullName} da lista`}>
                              <Trash />
                            </Button>
                          }
                          title={`Tirar ${row.fullName} da lista?`}
                          description={
                            row.guest
                              ? `O voucher dele(a) e o convite de ${row.guest.fullName} deixam de valer. O histórico fica guardado e dá para trazer de volta (o convidado é cadastrado de novo).`
                              : "O voucher deixa de valer na portaria. O histórico fica guardado e dá para trazer de volta."
                          }
                          confirmLabel="Tirar da lista"
                          tone="danger"
                          onConfirm={removeEmployeeAction.bind(null, row.employeeId)}
                          successMessage="Tirado(a) da lista."
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
                      description="Volta para a lista com um voucher novo (o antigo continua cancelado). Se tiver convidado, cadastre de novo na tela da pessoa."
                      confirmLabel="Trazer de volta"
                      tone="success"
                      onConfirm={restoreEmployeeAction.bind(null, row.employeeId)}
                      successMessage="De volta à lista, com voucher novo."
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
