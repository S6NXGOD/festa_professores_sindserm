"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Check, Copy, Link, Whatsapp } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { playSound } from "@/lib/sound";

const noopSubscribe = () => () => {};

/** Origem da página atual (vazia no servidor). */
export function useOrigin() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

/** Mostra e copia o link permanente dos vouchers do grupo (e, se quiser, manda pelo WhatsApp). */
export function CopyLinkBox({
  path,
  label,
  whatsapp,
}: {
  path: string;
  label: string;
  /** Botão "Enviar pelo WhatsApp": com telefone, abre a conversa direto com a pessoa. */
  whatsapp?: { phone?: string | null; text: string };
}) {
  const origin = useOrigin();
  const url = `${origin}${path}`;
  const [copied, setCopied] = useState(false);
  const phone = whatsapp?.phone ? normalizePhone(whatsapp.phone) : "";

  async function copy() {
    if (await copyText(url)) {
      setCopied(true);
      playSound("blip");
      toast.success("Link copiado. Guarde-o para abrir os vouchers depois.");
      window.setTimeout(() => setCopied(false), 2500);
    } else {
      toast.error("Não foi possível copiar. Selecione o link manualmente.");
    }
  }

  function sendWhatsapp() {
    if (!whatsapp) return;
    playSound("coin");
    const target = phone ? `https://wa.me/55${phone}` : "https://wa.me/";
    window.open(`${target}?text=${encodeURIComponent(`${whatsapp.text} ${url}`)}`, "_blank", "noopener,noreferrer");
  }

  return (
    // min-w-0: dentro de janelas (grid), o link longo não pode alargar a janela.
    <div className="no-print min-w-0 rounded-xl border border-line-strong bg-surface-2/90 p-4 backdrop-blur">
      <p className="flex items-center gap-2 text-sm font-bold text-fg">
        <Link className="size-4 text-red" /> {label}
      </p>
      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
        <code
          className="min-w-0 flex-1 truncate rounded-lg border border-line bg-ink px-3.5 py-3 font-mono text-xs text-fg-muted select-all"
          data-testid="group-link"
        >
          {url}
        </code>
        <Button type="button" onClick={copy} variant={copied ? "success" : "default"} className="shrink-0">
          {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar link"}
        </Button>
      </div>
      {whatsapp ? (
        <Button type="button" variant="success" className="mt-2 w-full" onClick={sendWhatsapp} data-testid="send-whatsapp">
          <Whatsapp />
          {phone ? (
            <>
              <span className="sm:hidden">Enviar para {formatPhone(phone)}</span>
              <span className="hidden sm:inline">Enviar pelo WhatsApp para {formatPhone(phone)}</span>
            </>
          ) : (
            "Enviar pelo WhatsApp"
          )}
        </Button>
      ) : null}
    </div>
  );
}
