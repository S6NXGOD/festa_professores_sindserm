"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { Key, Loader, Logout, Warning } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import { changeOwnPasswordAction } from "@/server/actions/users";

/**
 * Troca da própria senha. Com `forced` (senha provisória), a pessoa só usa o
 * sistema depois de criar uma senha que ninguém mais conhece.
 */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
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
    if (next === current) return setError("Escolha uma senha diferente da atual.");
    startTransition(async () => {
      const result = await callAction(changeOwnPasswordAction({ currentPassword: current, newPassword: next }));
      if (!result.ok) {
        playSound("error");
        setError(result.fieldErrors?.currentPassword ?? result.fieldErrors?.newPassword ?? result.error);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      playSound("powerup");
      toast.success(forced ? "Senha criada. Bem-vindo(a)!" : "Senha alterada. Outras sessões foram encerradas.");
      if (forced) router.replace(result.data.home);
      router.refresh();
    });
  }

  function signOut() {
    startTransition(async () => {
      await authClient.signOut();
      router.replace("/entrar");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate data-testid="change-password-form">
      <FormField id="current-password" label={forced ? "Senha que você recebeu" : "Senha atual"}>
        <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </FormField>
      <FormField id="new-password" label={forced ? "Sua nova senha" : "Nova senha"} description="Mínimo de 10 caracteres. Só você vai saber.">
        <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </FormField>
      <FormField id="confirm-password" label="Repita a nova senha">
        <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormField>
      {error ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          <Warning className="size-4 shrink-0" /> {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !current || !next} data-testid="change-password-submit">
        {pending ? <Loader className="animate-spin-steps" /> : <Key />} {forced ? "Criar minha senha" : "Trocar senha"}
      </Button>
      {forced ? (
        <button
          type="button"
          onClick={signOut}
          disabled={pending}
          className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg"
        >
          <Logout className="size-4" /> Sair e fazer isso depois
        </button>
      ) : null}
    </form>
  );
}
