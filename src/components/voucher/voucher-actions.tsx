"use client";

import { toast } from "sonner";
import { Download, Printer, Share, Whatsapp } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { copyText, slugify } from "@/lib/clipboard";
import { whatsappLink } from "@/lib/phone";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Ações individuais do voucher: compartilhar, salvar imagem e imprimir. */
export function VoucherActions({
  token,
  fullName,
  eventName,
  printMode,
  className,
  phone,
}: {
  token: string;
  fullName: string;
  eventName: string;
  /** "self": imprime esta página; "open": abre o voucher individual para impressão. */
  printMode: "self" | "open";
  className?: string;
  /** WhatsApp da pessoa: o botão já abre a conversa com ela (ex.: voucher de funcionário). */
  phone?: string | null;
}) {
  const path = `/v/${token}`;

  function absoluteUrl() {
    return `${window.location.origin}${path}`;
  }

  async function share() {
    playSound("blip");
    const url = absoluteUrl();
    const text = `Voucher de ${fullName} — ${eventName}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, text, url });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }
    if (await copyText(url)) toast.success("Link do voucher copiado.");
    else toast.error("Não foi possível copiar o link.");
  }

  function whatsapp() {
    playSound("coin");
    const text = `Voucher de ${fullName} para ${eventName}: ${absoluteUrl()}`;
    const url = phone ? whatsappLink(phone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function print() {
    playSound("blip");
    if (printMode === "self") window.print();
    else window.open(`${path}?imprimir=1`, "_blank", "noopener");
  }

  return (
    <div className={cn("no-print grid grid-cols-2 gap-2", className)}>
      <Button asChild variant="secondary" size="sm">
        <a
          href={`${path}/imagem`}
          download={`voucher-${slugify(fullName)}.png`}
          onClick={() => playSound("coin")}
          data-testid="voucher-save"
        >
          <Download /> Baixar imagem
        </a>
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={whatsapp}>
        <Whatsapp /> WhatsApp
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={share}>
        <Share /> Compartilhar
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={print}>
        <Printer /> Imprimir
      </Button>
    </div>
  );
}

/**
 * Manda o voucher de quem convidou e o do convidado numa mensagem só (ex.:
 * funcionário(a) do SINDSERM), já com o recado de como os kits saem.
 */
export function SendGroupVouchersButton({
  phone,
  hostName,
  hostToken,
  guestName,
  guestToken,
  eventName,
}: {
  phone: string | null;
  hostName: string;
  hostToken: string;
  guestName: string;
  guestToken: string;
  eventName: string;
}) {
  function send() {
    playSound("coin");
    const origin = window.location.origin;
    const text = [
      `Olá, ${hostName.split(" ")[0]}! Os vouchers para a ${eventName}:`,
      `• O seu: ${origin}/v/${hostToken}`,
      `• O de ${guestName}: ${origin}/v/${guestToken}`,
      "Na entrada, é só mostrar o QR Code. O seu kit sai junto com a sua entrada; o do convidado, depois que você chegar.",
    ].join("\n");
    const url = phone ? whatsappLink(phone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Button type="button" variant="success" size="lg" className="no-print w-full" onClick={send} data-testid="send-group-vouchers">
      <Whatsapp /> Mandar os 2 vouchers no WhatsApp
    </Button>
  );
}
