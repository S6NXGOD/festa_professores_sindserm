"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Gamepad, Trash } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { callAction } from "@/lib/call-action";
import { firstName } from "@/lib/text";
import { deleteUserAction, requireGateTrainingAgainAction } from "@/server/actions/users";

/** Apagar um usuário (quem tem histórico some da lista e perde o acesso; o nome fica nos registros). */
export function DeleteUserButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const kept = useRef(false);
  return (
    <ConfirmActionDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-danger hover:text-danger" data-testid="delete-user">
          <Trash /> Apagar
        </Button>
      }
      title={`Apagar ${name}?`}
      description={
        <>
          {firstName(name)} perde o acesso na hora e sai desta lista. Se já registrou entradas, kits ou fichas, o nome continua nesses
          registros: o histórico precisa dizer quem fez. Não dá para desfazer (dá para criar o usuário de novo, com o mesmo e-mail).
        </>
      }
      confirmLabel="Apagar usuário"
      tone="danger"
      onConfirm={async () => {
        const result = await callAction(deleteUserAction({ userId }));
        if (result.ok) kept.current = result.data.keptInHistory;
        return result;
      }}
      onDone={() => {
        toast.success(kept.current ? `${name} foi apagado(a). O nome continua só no histórico do que registrou.` : `${name} foi apagado(a).`);
        router.refresh();
      }}
      sound="coin"
    />
  );
}

/** Pede o treino relâmpago de novo a todo mundo que registra entradas (fora os administradores). */
export function RequireTrainingButton() {
  const router = useRouter();
  const people = useRef(0);
  return (
    <ConfirmActionDialog
      trigger={
        <Button variant="outline" data-testid="require-training">
          <Gamepad /> Pedir o treino de novo
        </Button>
      }
      title="Pedir os treinos de novo?"
      description="Todo mundo que registra entradas ou entrega kits (menos os administradores) faz o treino de novo antes de abrir a portaria ou a mesa dos kits. Leva 1 minuto."
      confirmLabel="Pedir o treino"
      tone="success"
      onConfirm={async () => {
        const result = await callAction(requireGateTrainingAgainAction());
        if (result.ok) people.current = result.data.people;
        return result;
      }}
      onDone={() => {
        toast.success(
          people.current === 1
            ? "Pronto: 1 pessoa faz o treino antes de abrir a portaria ou a mesa."
            : `Pronto: ${people.current} pessoas fazem o treino antes de abrir a portaria ou a mesa.`,
        );
        router.refresh();
      }}
      sound="coin"
    />
  );
}
