"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { FormDocuments, type FormFileView } from "@/components/documents/form-documents";
import { Check, Copy, ExternalLink, Pencil, Shield, Whatsapp } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DOCUMENT_KIND_LABEL } from "@/domain/labels";
import type { DocumentKind } from "@/domain/types";
import { govbrApprovedMessage, govbrSigningMessage } from "@/domain/whatsapp-messages";
import { callAction } from "@/lib/call-action";
import { copyText } from "@/lib/clipboard";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { playSound } from "@/lib/sound";
import { firstName } from "@/lib/text";
import { cn } from "@/lib/utils";
import { formalizeAffiliationAction } from "@/server/actions/affiliation-forms";

/** Onde o gov.br confere se uma assinatura digital é válida. */
const GOVBR_VALIDATOR = "https://validar.iti.gov.br";

/**
 * Aviso de "filiação efetivada": confirmada a assinatura, a página vira "assinada"
 * e o painel do gov.br sai da tela. O diálogo mora num lugar que existe em
 * qualquer situação da ficha (GovbrApprovedHost) e é chamado por este evento.
 */
const APPROVED_EVENT = "festa:govbr-aprovada";

/**
 * Assinar a ficha pelo gov.br, sem esperar a festa: (1) a equipe manda a ficha
 * pelo WhatsApp (link com o passo a passo e o PDF), (2) anexa o PDF assinado que
 * voltou no WhatsApp da secretaria e (3) confirma — a filiação é efetivada e os
 * vouchers já valem na portaria.
 */
export function GovbrSigning({
  formId,
  fullName,
  whatsapp,
  signingPath,
  formsWhatsapp,
  eventName,
  signedFiles,
  missingRequired,
  canEdit,
}: {
  formId: string;
  fullName: string;
  whatsapp: string;
  /** "/assinar/<token>" (o site completa com o endereço). */
  signingPath: string;
  /** WhatsApp da secretaria que recebe a ficha assinada. */
  formsWhatsapp: string | null;
  eventName: string;
  signedFiles: FormFileView[];
  /** RG e contracheque que ainda faltam (também exigidos). */
  missingRequired: DocumentKind[];
  /** Pode mandar, anexar e confirmar (Fichas: editar). */
  canEdit: boolean;
}) {
  const first = firstName(fullName);
  const hasSigned = signedFiles.length > 0;
  const ready = hasSigned && missingRequired.length === 0;
  const url = () => `${window.location.origin}${signingPath}`;

  function send() {
    playSound("coin");
    window.open(whatsappLink(whatsapp, govbrSigningMessage({ fullName, eventName, link: url(), formsPhone: formsWhatsapp })), "_blank", "noopener,noreferrer");
  }

  async function copy() {
    const ok = await copyText(url());
    playSound(ok ? "blip" : "error");
    if (ok) toast.success("Link copiado: é só colar na conversa.");
    else toast.error("Não deu para copiar neste aparelho.");
  }

  const steps = [
    { done: hasSigned, title: `Mande a ficha para ${first}` },
    { done: hasSigned, title: "Anexe o PDF assinado" },
    { done: false, title: "Confirme a assinatura" },
  ];
  const current = hasSigned ? 2 : 0;

  return (
    <section className="relative overflow-clip rounded-2xl border border-[#38bdf8]/40 bg-[linear-gradient(160deg,rgb(14_116_144/0.18),rgb(8_8_8/0.9)_60%)] p-4 sm:p-5" data-testid="govbr-signing">
      <div className="halftone pointer-events-none absolute -top-10 -right-10 size-40 rounded-full opacity-20 [mask-image:radial-gradient(circle,#000_25%,transparent_70%)]" />
      <header className="relative flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="pixel text-[0.55rem] text-[#7dd3fc]">Sem esperar a festa</p>
          <h2 className="display mt-1 text-[1.5rem] leading-none text-fg">Assinar pelo gov.br</h2>
        </div>
        <Button asChild variant="ghost" size="sm">
          <a href={signingPath} target="_blank" rel="noopener noreferrer" data-testid="govbr-open-guide">
            <ExternalLink /> Ver o que {first} recebe
          </a>
        </Button>
      </header>
      <p className="relative mt-2 text-sm text-fg-muted">
        {first} baixa a ficha pronta, assina no celular com a conta gov.br e manda o PDF assinado para o WhatsApp da secretaria
        {formsWhatsapp ? `, ${formatPhone(formsWhatsapp)}` : ""}. Você anexa aqui e confirma: a filiação é efetivada e o voucher já vale
        na portaria.
      </p>

      <ol className="relative mt-4 grid gap-3">
        {steps.map((step, index) => (
          <motion.li
            key={step.title}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 * index }}
            className={cn(
              "rounded-xl border p-3.5",
              index === current ? "border-[#38bdf8]/60 bg-ink/60 shadow-[0_0_24px_-14px_#38bdf8]" : "border-line bg-ink/40",
            )}
          >
            <p className="flex items-center gap-2.5 font-bold text-fg">
              <span
                className={cn(
                  "pixel inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[0.55rem]",
                  step.done ? "bg-success text-success-foreground" : index === current ? "bg-[#0ea5e9] text-white" : "bg-surface-3 text-fg-muted",
                )}
              >
                {step.done ? <Check className="size-4" /> : index + 1}
              </span>
              {step.title}
            </p>
            {index === 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button variant="success" onClick={send} disabled={!canEdit} data-testid="govbr-send">
                  <Whatsapp /> Mandar no WhatsApp de {first}
                </Button>
                <Button variant="outline" onClick={() => void copy()} data-testid="govbr-copy">
                  <Copy /> Copiar o link
                </Button>
                <p className="text-xs text-fg-dim sm:col-span-2">
                  A mensagem já vai com o passo a passo, o link da ficha e o número da secretaria. O link vale 60 dias.
                </p>
              </div>
            ) : null}
            {index === 1 ? (
              <div className="mt-3">
                <FormDocuments formId={formId} files={signedFiles} canRemove={canEdit} disabled={!canEdit} kinds={["SIGNED_FORM"]} className="grid" />
              </div>
            ) : null}
            {index === 2 ? (
              <div className="mt-3 space-y-2">
                {!ready ? (
                  <p className="text-xs text-fg-muted">
                    {!hasSigned
                      ? "Anexe o PDF assinado para confirmar."
                      : `Falta anexar: ${missingRequired.map((kind) => DOCUMENT_KIND_LABEL[kind]).join(" e ")} (em Documentos, abaixo).`}
                  </p>
                ) : null}
                <ConfirmActionDialog
                  trigger={
                    <Button variant="success" size="lg" className="w-full sm:w-auto" disabled={!ready || !canEdit} data-testid="govbr-confirm">
                      <Pencil /> Confirmar assinatura gov.br
                    </Button>
                  }
                  title="A assinatura do gov.br confere?"
                  description={
                    <>
                      Abra o PDF assinado e confira o nome de {first} na assinatura. Na dúvida, envie o arquivo em{" "}
                      <a href={GOVBR_VALIDATOR} target="_blank" rel="noopener noreferrer" className="font-semibold text-red underline underline-offset-4">
                        validar.iti.gov.br
                      </a>
                      . Confirmando, {first} passa a ser filiado(a) e o voucher já vale na entrada.
                    </>
                  }
                  confirmLabel="Confirmar e efetivar"
                  tone="success"
                  sound="fanfare"
                  onConfirm={async () => {
                    const result = await callAction(formalizeAffiliationAction(formId, "GOVBR"));
                    if (result.ok) window.dispatchEvent(new CustomEvent(APPROVED_EVENT, { detail: { accessToken: result.data.accessToken } }));
                    return result;
                  }}
                  successMessage={`Filiação de ${first} efetivada pelo gov.br!`}
                />
              </div>
            ) : null}
          </motion.li>
        ))}
      </ol>
      <p className="relative mt-3 flex items-start gap-2 text-xs text-fg-dim">
        <Shield className="mt-0.5 size-3.5 shrink-0" /> O RG e o contracheque continuam obrigatórios. O PDF assinado fica guardado com
        criptografia, junto com a ficha.
      </p>
    </section>
  );
}

/** Diálogo de filiação efetivada (com o "Avisar pelo WhatsApp"). Fica na página em qualquer situação da ficha. */
export function GovbrApprovedHost({ fullName, whatsapp, eventName }: { fullName: string; whatsapp: string; eventName: string }) {
  const router = useRouter();
  const first = firstName(fullName);
  const [approved, setApproved] = useState<{ accessToken: string | null } | null>(null);

  useEffect(() => {
    const onApproved = (event: Event) => setApproved((event as CustomEvent<{ accessToken: string | null }>).detail);
    window.addEventListener(APPROVED_EVENT, onApproved);
    return () => window.removeEventListener(APPROVED_EVENT, onApproved);
  }, []);

  return (
    <Dialog
      open={Boolean(approved)}
      onOpenChange={(open) => {
        if (!open) {
          setApproved(null);
          router.refresh();
        }
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="govbr-approved">
        <DialogHeader>
          <motion.span
            initial={{ scale: 0.3, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 14 }}
            className="inline-flex size-12 items-center justify-center rounded-xl bg-success text-success-foreground"
          >
            <Check className="size-7" />
          </motion.span>
          <DialogTitle>{first} agora é filiado(a)!</DialogTitle>
          <DialogDescription>A ficha assinada pelo gov.br foi confirmada. Avise {first}: o voucher já vale na entrada.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setApproved(null);
              router.refresh();
            }}
          >
            Fechar
          </Button>
          <Button
            variant="success"
            onClick={() => {
              playSound("coin");
              const vouchersUrl = approved?.accessToken ? `${window.location.origin}/vouchers/${approved.accessToken}` : null;
              window.open(whatsappLink(whatsapp, govbrApprovedMessage({ fullName, eventName, vouchersUrl })), "_blank", "noopener,noreferrer");
            }}
            data-testid="govbr-notify"
          >
            <Whatsapp /> Avisar {first}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
