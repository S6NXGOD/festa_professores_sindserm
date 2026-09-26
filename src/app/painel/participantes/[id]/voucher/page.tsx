import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Cancel } from "@/components/icons/pixel";
import { EmptyState } from "@/components/staff/panel-ui";
import { Button } from "@/components/ui/button";
import { SendGroupVouchersButton, VoucherActions } from "@/components/voucher/voucher-actions";
import { VoucherCard, voucherEventFrom } from "@/components/voucher/voucher-card";
import { homePathFor } from "@/domain/access";
import { can } from "@/domain/rules";
import { db } from "@/server/db";
import { person } from "@/server/db/schema";
import { getEventInfo } from "@/server/queries/config";
import { loadEmployeeGroupVouchers, loadVoucherForStaff } from "@/server/queries/vouchers";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Voucher", referrer: "no-referrer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StaffVoucherPage({ params }: PageProps<"/painel/participantes/[id]/voucher">) {
  const actor = await requirePageActor();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [card, event, contact, employeeGroup] = await Promise.all([
    loadVoucherForStaff(id),
    getEventInfo(),
    db.select({ whatsapp: person.whatsapp }).from(person).where(eq(person.id, id)).limit(1),
    loadEmployeeGroupVouchers(id),
  ]);
  // Vouchers: quem cuida das inscrições; os dos colaboradores, também quem vê a lista de colaboradores.
  if (!can(actor.access, "reissueVoucher") && !(employeeGroup && can(actor.access, "viewEmployees"))) redirect(homePathFor(actor.access));
  const phone = contact[0]?.whatsapp ?? null;
  // Funcionário(a) com convidado: os dois vouchers na mesma tela, para mandar numa mensagem só.
  const guestCard = employeeGroup?.guest ?? null;
  return (
    <div className="mx-auto max-w-md space-y-5">
      <Button asChild variant="ghost" className="no-print -ml-2">
        <Link href={`/painel/participantes/${id}`}>
          <ArrowLeft /> Voltar ao cadastro
        </Link>
      </Button>
      {card && event ? (
        <>
          {guestCard ? (
            <SendGroupVouchersButton
              phone={phone}
              hostName={card.fullName}
              hostToken={card.token}
              guestName={guestCard.fullName}
              guestToken={guestCard.token}
              eventName={event.name}
            />
          ) : null}
          <VoucherCard eager card={card} event={voucherEventFrom(event)} />
          <VoucherActions token={card.token} fullName={card.fullName} eventName={event.name} printMode="self" phone={phone} />
          {guestCard ? (
            <>
              <VoucherCard card={guestCard} event={voucherEventFrom(event)} className="mt-8" />
              <VoucherActions token={guestCard.token} fullName={guestCard.fullName} eventName={event.name} printMode="open" />
            </>
          ) : null}
        </>
      ) : (
        <EmptyState icon={Cancel} title="Sem voucher ativo">
          Esta pessoa não tem voucher válido. Use “Reemitir QR Code” no cadastro.
        </EmptyState>
      )}
    </div>
  );
}
