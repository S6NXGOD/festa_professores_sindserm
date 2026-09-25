"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Cancel, Login, Pencil, Printer, Warning } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CopyLinkBox } from "@/components/voucher/copy-link-box";
import { DOCUMENT_KIND_LABEL } from "@/domain/labels";
import type { DocumentKind } from "@/domain/types";
import { callAction } from "@/lib/call-action";
import { cancelAffiliationFormAction, formalizeAffiliationAction } from "@/server/actions/affiliation-forms";

interface FormalizeResult {
  personId: string;
  accessToken: string | null;
  hostName: string | null;
}

/**
 * Ações da ficha (imprimir, confirmar assinatura, cancelar) e o diálogo de
 * resultado. Fica na mesma posição da página em qualquer status: assim o
 * diálogo continua aberto quando a página é atualizada para "assinada".
 */
export function FormalizeController({
  formId,
  name,
  status,
  missingDocuments = [],
}: {
  formId: string;
  name: string;
  status: "DRAFT" | "FORMALIZED" | "CANCELLED";
  /** A assinatura só é confirmada com RG e contracheque anexados. */
  missingDocuments?: DocumentKind[];
}) {
  const router = useRouter();
  const [done, setDone] = useState<FormalizeResult | null>(null);

  function goToPerson() {
    if (done) router.push(`/painel/participantes/${done.personId}`);
    setDone(null);
  }

  // A pessoa está na recepção: o próximo passo é registrar a entrada (e entregar o kit).
  function goToEntry() {
    if (done) router.push(`/portaria/pessoa/${done.personId}?entrar=1`);
    setDone(null);
  }

  return (
    <>
      {status === "DRAFT" && missingDocuments.length ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3.5 py-2.5 text-sm font-semibold text-fg" data-testid="missing-documents">
          <Warning className="mt-0.5 size-4 shrink-0 text-warning" />
          Para confirmar a assinatura, anexe: {missingDocuments.map((kind) => DOCUMENT_KIND_LABEL[kind]).join(" e ")} (em Documentos,
          abaixo — dá para tirar a foto na hora).
        </p>
      ) : null}
      {status === "DRAFT" ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/painel/filiacoes/${formId}/imprimir`} target="_blank">
              <Printer /> Imprimir ficha
            </Link>
          </Button>
          <ConfirmActionDialog
            trigger={
              <Button variant="success" data-testid="formalize-affiliation" disabled={missingDocuments.length > 0}>
                <Pencil /> Assinatura colhida
              </Button>
            }
            title="A ficha foi assinada?"
            description={`Confirme só depois que a ficha impressa estiver assinada. ${name} passa a ser filiado(a) na festa.`}
            confirmLabel="Confirmar assinatura"
            tone="success"
            sound="fanfare"
            onConfirm={async () => {
              const result = await callAction(formalizeAffiliationAction(formId));
              if (result.ok) setDone(result.data);
              return result;
            }}
            successMessage="Filiação registrada. Bem-vindo(a) ao SINDSERM!"
          />
          <ConfirmActionDialog
            trigger={
              <Button variant="ghost" className="text-danger">
                <Cancel /> Cancelar ficha
              </Button>
            }
            title="Cancelar esta ficha?"
            description="A ficha deixa de valer. Se foi preenchida antes da festa, a inscrição deixa de liberar a entrada como filiado(a)."
            confirmLabel="Cancelar ficha"
            tone="danger"
            onConfirm={() => cancelAffiliationFormAction(formId)}
            successMessage="Ficha cancelada."
            onDone={() => router.refresh()}
          />
        </div>
      ) : null}

      <Dialog open={Boolean(done)} onOpenChange={(open) => !open && goToPerson()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Filiação registrada</DialogTitle>
            <DialogDescription>
              {name} agora é filiado(a).
              {done?.hostName ? ` Deixou de ser convidado(a) de ${done.hostName}, que pode chamar outro convidado.` : ""}
            </DialogDescription>
          </DialogHeader>
          {done?.accessToken ? <CopyLinkBox path={`/vouchers/${done.accessToken}`} label="Link dos vouchers do(a) novo(a) filiado(a)" /> : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={goToPerson} data-testid="go-to-new-member">
              Ir para o cadastro
            </Button>
            <Button variant="success" onClick={goToEntry} autoFocus data-testid="go-to-entry">
              <Login /> Registrar a entrada agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
