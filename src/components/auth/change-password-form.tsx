"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { Key, Loader, Warning } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < 10) return setError("A nova senha precisa ter pelo menos 10 caracteres.");
    if (next !== confirm) return setError("As senhas não conferem.");
    startTransition(async () => {
      const { error: authError } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (authError) {
        setError(authError.status === 429 ? "Muitas tentativas. Aguarde um minuto." : "Senha atual incorreta.");
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Senha alterada. Outras sessões foram encerradas.");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormField id="current-password" label="Senha atual">
        <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </FormField>
      <FormField id="new-password" label="Nova senha" description="Mínimo de 10 caracteres.">
        <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </FormField>
      <FormField id="confirm-password" label="Confirme a nova senha">
        <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormField>
      {error ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          <Warning className="size-4 shrink-0" /> {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !current || !next}>
        {pending ? <Loader className="animate-spin-steps" /> : <Key />} Trocar senha
      </Button>
    </form>
  );
}
