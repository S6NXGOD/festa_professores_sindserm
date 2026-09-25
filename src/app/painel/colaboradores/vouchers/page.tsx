import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/common/print-button";
import { ArrowLeft, Info } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { AutoPrint } from "@/components/voucher/auto-print";
import { VoucherCard, voucherEventFrom } from "@/components/voucher/voucher-card";
import { db } from "@/server/db";
import { getEventInfo } from "@/server/queries/config";
import { loadVoucherForStaff } from "@/server/queries/vouchers";
import { listEmployees } from "@/server/services/employees";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Vouchers dos colaboradores", referrer: "no-referrer" };

/** Vouchers de todos os funcionários (e dos convidados deles, logo ao lado), dois por linha, para imprimir de uma vez. */
export default async function EmployeeVouchersPage({ searchParams }: PageProps<"/painel/colaboradores/vouchers">) {
  await requirePageActor("viewEmployees");
  const [query, event, employees] = await Promise.all([searchParams, getEventInfo(), listEmployees(db)]);
  const people = employees.flatMap((row) => [row.personId, ...(row.guest ? [row.guest.personId] : [])]);
  const cards = (await Promise.all(people.map((personId) => loadVoucherForStaff(personId)))).filter((card) => card !== null);
  const voucherEvent = event ? voucherEventFrom(event) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <style>{"@media print { @page { size: A4; margin: 8mm; } }"}</style>
      <AutoPrint enabled={query.imprimir === "1"} />
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="-ml-2">
          <Link href="/painel/colaboradores">
            <ArrowLeft /> Colaboradores
          </Link>
        </Button>
        {cards.length ? <PrintButton label={`Imprimir ${cards.length} ${cards.length === 1 ? "voucher" : "vouchers"}`} /> : null}
      </div>
      <p className="no-print mb-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-warning" />
        Dois vouchers por linha, em folha A4: o de cada colaborador(a) e, logo depois, o do convidado dele(a). Cada um tem o próprio QR
        Code.
      </p>
      {cards.length && voucherEvent ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-4" data-testid="employee-badges">
          {cards.map((card) => (
            <VoucherCard key={card.personId} card={card} event={voucherEvent} className="break-inside-avoid print:max-w-[92mm]" />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-fg-muted">Ninguém na lista de colaboradores.</p>
      )}
    </div>
  );
}
