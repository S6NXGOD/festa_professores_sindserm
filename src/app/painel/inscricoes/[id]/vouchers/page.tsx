import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/common/print-button";
import { ArrowLeft, Info } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { AutoPrint } from "@/components/voucher/auto-print";
import { VoucherCard, voucherEventFrom } from "@/components/voucher/voucher-card";
import { db } from "@/server/db";
import { getEventInfo } from "@/server/queries/config";
import { loadVoucherForStaff } from "@/server/queries/vouchers";
import { loadRegistrationState } from "@/server/services/state";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Vouchers da inscrição", referrer: "no-referrer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Os vouchers do grupo (professor(a) e convidado) lado a lado, numa folha só. */
export default async function RegistrationVouchersPage({ params, searchParams }: PageProps<"/painel/inscricoes/[id]/vouchers">) {
  await requirePageActor("reissueVoucher");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const registration = await loadRegistrationState(db, id);
  if (!registration) notFound();
  const [event, memberCard, guestCard] = await Promise.all([
    getEventInfo(),
    loadVoucherForStaff(registration.member.id),
    registration.guest ? loadVoucherForStaff(registration.guest.personId) : Promise.resolve(null),
  ]);
  if (!event) notFound();
  const cards = [memberCard, guestCard].filter((card) => card !== null);
  const voucherEvent = voucherEventFrom(event);

  return (
    <div className="mx-auto max-w-4xl">
      <style>{"@media print { @page { size: A4; margin: 8mm; } }"}</style>
      <AutoPrint enabled={query.imprimir === "1"} />
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="-ml-2">
          <Link href={`/painel/inscricoes/${id}`}>
            <ArrowLeft /> Voltar à inscrição
          </Link>
        </Button>
        <PrintButton label={cards.length > 1 ? "Imprimir os 2 vouchers" : "Imprimir voucher"} />
      </div>
      <p className="no-print mb-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-red" />
        Sai tudo numa folha A4. Recorte pela borda de cada voucher e entregue cada um à sua pessoa.
      </p>
      {cards.length ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-4" data-testid="registration-vouchers">
          {cards.map((card, index) => (
            <VoucherCard key={card.personId} card={card} event={voucherEvent} eager={index === 0} className="print:max-w-[92mm]" />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-fg-muted">
          Nenhum voucher ativo nesta inscrição. Use “Reemitir QR Code” no cadastro de cada pessoa.
        </p>
      )}
    </div>
  );
}
