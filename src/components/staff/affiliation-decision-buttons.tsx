"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Cancel, Check, Pencil, Printer } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { cancelAffiliationFormAction, formalizeAffiliationAction } from "@/server/actions/affiliation-forms";
import { decideAffiliationAction } from "@/server/actions/operations";

/** Conferir filiação declarada: confirmar ou não confirmar. */
export function AffiliationDecisionButtons({ registrationId, name, isTeacher }: { registrationId: string; name: string; isTeacher: boolean }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
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

/** Ficha preenchida antes da festa: imprimir, confirmar a assinatura ou cancelar. */
export function SignatureButtons({ formId, name }: { formId: string; name: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <Link href={`/painel/filiacoes/${formId}/imprimir`} target="_blank">
          <Printer /> Imprimir
        </Link>
      </Button>
      <ConfirmActionDialog
        trigger={
          <Button variant="success" data-testid="queue-signature">
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
