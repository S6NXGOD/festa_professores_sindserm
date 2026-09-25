"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Cancel, Check, Pencil, Printer, Upload } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cancelAffiliationFormAction, formalizeAffiliationAction } from "@/server/actions/affiliation-forms";
import { decideAffiliationAction } from "@/server/actions/operations";

/** Conferir filiação declarada: confirmar ou não confirmar. */
export function AffiliationDecisionButtons({ registrationId, name, isTeacher }: { registrationId: string; name: string; isTeacher: boolean }) {
  const router = useRouter();
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <ConfirmActionDialog
        trigger={
          <Button variant="success" data-testid="queue-confirm">
            <Check /> Confirmar
          </Button>
        }
        title="Confirmar filiação?"
        description={`${name} passa a ter direito à entrada${isTeacher ? ", ao kit de consumação e a um convidado" : " (sem kit, por não ser professor(a))"}.`}
        confirmLabel="Confirmar"
        tone="success"
        sound="coin"
        onConfirm={() => decideAffiliationAction({ registrationId, decision: "CONFIRM" })}
        successMessage={`Filiação de ${name} confirmada.`}
        onDone={() => router.refresh()}
      />
      <ConfirmActionDialog
        trigger={
          <Button variant="destructive" data-testid="queue-reject">
            <Cancel /> Não confirmar
          </Button>
        }
        title="Não confirmar a filiação?"
        description={`${name} não poderá entrar como filiado(a).`}
        confirmLabel="Não confirmar"
        tone="danger"
        justification="optional"
        justificationLabel="Observação"
        onConfirm={(note) => decideAffiliationAction({ registrationId, decision: "REJECT", note })}
        successMessage="Registrado como não confirmada."
        onDone={() => router.refresh()}
      />
    </div>
  );
}

/**
 * Ficha esperando assinatura: imprimir, confirmar a assinatura ou cancelar.
 * Sem o RG e o contracheque anexados a assinatura não vale: no lugar do
 * "Assinada" aparece o atalho para anexar na ficha.
 */
export function SignatureButtons({ formId, name, missingDocuments = false }: { formId: string; name: string; missingDocuments?: boolean }) {
  const router = useRouter();
  // No celular, a ação principal ocupa a linha de cima; imprimir e cancelar dividem a de baixo.
  const primary = "col-span-2 order-first sm:order-none";
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <Button asChild variant="outline">
        <Link href={`/painel/filiacoes/${formId}/imprimir`} target="_blank">
          <Printer /> Imprimir
        </Link>
      </Button>
      {missingDocuments ? (
        <Button asChild variant="outline" className={cn(primary, "border-warning/60 text-warning hover:text-warning")} data-testid="queue-attach">
          <Link href={`/painel/filiacoes/${formId}`}>
            <Upload /> Anexar documentos
          </Link>
        </Button>
      ) : (
        <ConfirmActionDialog
          trigger={
            <Button variant="success" className={primary} data-testid="queue-signature">
              <Pencil /> Assinada
            </Button>
          }
          title="A ficha foi assinada?"
          description={`Confirme só com a ficha impressa assinada. ${name} passa a ser filiado(a) na festa.`}
          confirmLabel="Confirmar assinatura"
          tone="success"
          sound="fanfare"
          onConfirm={() => formalizeAffiliationAction(formId)}
          successMessage={`${name} agora é filiado(a)!`}
          onDone={() => router.refresh()}
        />
      )}
      <ConfirmActionDialog
        trigger={
          <Button variant="ghost" className="text-danger">
            <Cancel /> Não assinou
          </Button>
        }
        title="Cancelar a ficha?"
        description="A ficha deixa de valer e a inscrição não libera a entrada como filiado(a)."
        confirmLabel="Cancelar ficha"
        tone="danger"
        onConfirm={() => cancelAffiliationFormAction(formId)}
        successMessage="Ficha cancelada."
        onDone={() => router.refresh()}
      />
    </div>
  );
}
