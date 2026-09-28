"use client";

import { Whatsapp } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { courtesyClosingLine } from "@/domain/whatsapp-messages";
import { playSound } from "@/lib/sound";
import { firstName } from "@/lib/text";

/**
 * Manda os vouchers de um convite inteiro numa mensagem só (ex.: a família do
 * presidente): a equipe escolhe o contato no WhatsApp e cada pessoa recebe o
 * link do próprio voucher.
 */
export function ShareCourtesyVouchersButton({
  inviter,
  people,
  eventName,
}: {
  inviter: string | null;
  people: { fullName: string; token: string; withKit: boolean }[];
  eventName: string;
}) {
  if (people.length === 0) return null;

  function send() {
    playSound("coin");
    const origin = window.location.origin;
    const intro =
      people.length === 1
        ? `Olá, ${firstName(people[0]!.fullName)}! Aqui está o seu voucher de cortesia para a ${eventName}:`
        : `Olá! Os vouchers de cortesia para a ${eventName}${inviter ? ` (convite: ${inviter})` : ""}:`;
    const text = [intro, ...people.map((person) => `• ${person.fullName}: ${origin}/v/${person.token}`), courtesyClosingLine(people)].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Button type="button" variant="success" size="sm" onClick={send} className="shrink-0" data-testid="share-courtesy-group">
      <Whatsapp /> {people.length === 1 ? "Mandar o voucher" : `Mandar os ${people.length}`}
    </Button>
  );
}
