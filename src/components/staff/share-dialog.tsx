"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Download, Link as LinkIcon, Loader, Megaphone, Reload, Save, Warning, Whatsapp } from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { callAction } from "@/lib/call-action";
import { copyText } from "@/lib/clipboard";
import { playSound } from "@/lib/sound";
import { updateShareMessageAction } from "@/server/actions/setup";

/**
 * Divulgação da festa: prévia do link como aparece no WhatsApp, mensagem
 * pronta (montada com os dados da festa, editável) e atalhos para copiar,
 * mandar no WhatsApp e baixar o QR Code para cartaz ou grupo.
 */
export function ShareDialog({
  url,
  autoMessage,
  savedMessage,
  canEdit,
  title,
  summary,
}: {
  url: string;
  autoMessage: string;
  savedMessage: string | null;
  canEdit: boolean;
  title: string;
  summary: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(savedMessage ?? autoMessage);
  const [saving, startSaving] = useTransition();
  const isAuto = message === autoMessage;
  const missingLink = !message.includes(url);
  const host = url.replace(/^https?:\/\//, "");

  async function copy(text: string, done: string) {
    if (await copyText(text)) {
      playSound("coin");
      toast.success(done);
    } else {
      toast.error("Não deu para copiar. Selecione o texto e copie manualmente.");
    }
  }

  function save(next: string | null) {
    startSaving(async () => {
      const result = await callAction(updateShareMessageAction(next));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        return;
      }
      playSound("powerup");
      toast.success(next ? "Mensagem salva: é ela que aparece para toda a equipe." : "De volta à mensagem automática.");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) setMessage(savedMessage ?? autoMessage);
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="open-share">
          <Megaphone /> Divulgar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl" data-testid="share-dialog">
        <DialogHeader>
          <PixelTag tone="red" className="w-fit">
            Espalhe a notícia
          </PixelTag>
          <DialogTitle>Divulgar a festa</DialogTitle>
          <DialogDescription>Mensagem pronta com os dados da festa. Copie e cole nos grupos, ou mande direto no WhatsApp.</DialogDescription>
        </DialogHeader>

        {/* Como o link aparece no WhatsApp. */}
        <div className="overflow-hidden rounded-xl border border-line-strong bg-[#1f2c33]" aria-label="Prévia do link no WhatsApp">
          {/* eslint-disable-next-line @next/next/no-img-element -- a própria imagem de prévia do site */}
          <img src="/opengraph-image" alt="" width={1200} height={630} className="aspect-[1200/630] w-full object-cover" />
          <div className="space-y-0.5 bg-[#1d282f] px-3 py-2.5">
            <p className="line-clamp-1 text-sm font-bold text-[#e9edef]">{title}</p>
            <p className="line-clamp-2 text-xs text-[#8696a0]">{summary}</p>
            <p className="text-xs text-[#8696a0]">{host}</p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="share-message" className="text-sm font-bold text-fg">
              Mensagem
            </label>
            <span className="text-xs font-semibold text-fg-dim">{isAuto ? "Automática (acompanha a festa)" : "Personalizada"}</span>
          </div>
          <Textarea
            id="share-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={11}
            className="font-sans text-sm leading-relaxed"
            data-testid="share-message"
          />
          {missingLink ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <Warning className="size-3.5" /> A mensagem está sem o link da inscrição.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={() => copy(message, "Mensagem copiada! É só colar no grupo.")} data-testid="share-copy">
            <Copy /> Copiar mensagem
          </Button>
          <Button asChild variant="success">
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" onClick={() => playSound("blip")}>
              <Whatsapp /> WhatsApp
            </a>
          </Button>
          <Button type="button" variant="outline" onClick={() => copy(url, "Link copiado!")} data-testid="share-copy-link">
            <LinkIcon /> Copiar só o link
          </Button>
          <Button asChild variant="outline">
            <a href="/divulgacao/qr" download="qr-inscricao-festa.png" onClick={() => playSound("blip")}>
              <Download /> QR Code
            </a>
          </Button>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-xs text-fg-muted">Salve o texto para toda a equipe usar o mesmo.</p>
            <div className="flex gap-2">
              {savedMessage ? (
                <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => save(null)}>
                  <Reload /> Automática
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={saving || isAuto || message === savedMessage}
                onClick={() => save(message)}
                data-testid="share-save"
              >
                {saving ? <Loader className="animate-spin-steps" /> : <Save />} Salvar texto
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
