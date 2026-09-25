import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Building, Gift, Login, Pencil, Printer, QrCode, Reload, Trash, Users, Warning } from "@/components/icons/pixel";
import { PlayerTag } from "@/components/retro/bits";
import { ChipFilters, EmptyState, PageHeader, StatTile } from "@/components/staff/panel-ui";
import { BulkEmployeesDialog, EditEmployeeDialog, EmployeeDialog } from "@/components/staff/employee-dialogs";
import { ToneBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
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

export const metadata: Metadata = { title: "Funcionários do SINDSERM" };

const FILTERS = {
  "": "Todos",
  fora: "Ainda não entraram",
  dentro: "Já entraram",
  removidos: "Tirados da lista",
} as const;

export default async function EmployeesPage({ searchParams }: PageProps<"/painel/funcionarios">) {
  await requirePageActor("manageEmployees");
  const query = await searchParams;
  const filterParam = typeof query.filtro === "string" ? query.filtro : typeof query.removidos === "string" ? "removidos" : "";
  const filter = (Object.hasOwn(FILTERS, filterParam) ? filterParam : "") as keyof typeof FILTERS;
  const [all, stock] = await Promise.all([listEmployees(db, { includeRemoved: true }), getStockOverview(db)]);
  const active = all.filter((row) => !row.removedAt);
  const present = active.filter((row) => row.checkedInAt);
  const guests = active.filter((row) => row.guest);
  const guestsPresent = guests.filter((row) => row.guest?.checkedInAt).length;
  // Todo funcionário tem kit; o convidado dele também (os dois do estoque dos funcionários).
  const kitsNeeded = active.length + guests.length;
  const employeePool = stock?.pools.find((pool) => pool.pool === "EMPLOYEE") ?? null;
  const rows =
    filter === "removidos"
      ? all.filter((row) => row.removedAt)
      : filter === "dentro"
        ? present
        : filter === "fora"
          ? active.filter((row) => !row.checkedInAt)
          : active;

  return (
    <div>
      <PageHeader
        eyebrow="Cadastro interno"
        title="Funcionários do SINDSERM"
        description="Funcionários liberados para a festa: cada um tem voucher próprio (dourado, diferente do voucher dos filiados), 1 kit de consumação e pode levar 1 convidado com kit. Os kits saem do estoque dos funcionários."
        actions={
          <>
            <EmployeeDialog />
            <BulkEmployeesDialog />
            {active.length > 0 ? (
              <Button asChild variant="outline">
                <Link href="/painel/funcionarios/vouchers" data-testid="print-badges">
                  <Printer /> Imprimir vouchers
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Liberados" value={active.length} icon={Building} tone="warning" testId="stat-employees" />
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
          label="Estoque dos funcionários"
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
              ? `O estoque dos funcionários (${employeePool.total}) é menor que os kits previstos: ${plural(active.length, "funcionário", "funcionários")} + ${plural(guests.length, "convidado", "convidados")} = ${kitsNeeded}.`
              : `Nenhum kit cadastrado no estoque dos funcionários: são previstos ${kitsNeeded} (funcionários + convidados).`}{" "}
            <Link href="/painel/kits" className="underline underline-offset-4">
              Ajustar em Kits e estoque
            </Link>
          </span>
        </p>
      ) : null}

      <ChipFilters
        basePath="/painel/funcionarios"
        current={filter}
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
        <EmptyState icon={Building} title={filter ? "Ninguém aqui" : "Nenhum funcionário liberado ainda"}>
          {filter ? "Nenhum funcionário neste filtro." : "Libere um por um (já com o convidado) ou cole a lista inteira de uma vez."}
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
                <span className="pixel inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-warning text-[0.6rem] text-warning-foreground shadow-[0_3px_0_0_#8a6a00]">
                  {initials(row.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/painel/participantes/${row.personId}`} className="font-bold text-fg hover:text-red hover:underline">
                    {row.fullName}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {row.jobTitle ? <ToneBadge tone="warning">{row.jobTitle}</ToneBadge> : null}
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
                      <EditEmployeeDialog
                        initial={{
                          employeeId: row.employeeId,
                          fullName: row.fullName,
                          cpf: row.cpf ? formatCpf(row.cpf) : "",
                          whatsapp: row.whatsapp ? maskPhoneInput(row.whatsapp) : "",
                          jobTitle: row.jobTitle ?? "",
                        }}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${row.fullName}`}>
                            <Pencil />
                          </Button>
                        }
                      />
                      {!row.checkedInAt && !row.guest?.checkedInAt ? (
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
                  ) : (
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
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
