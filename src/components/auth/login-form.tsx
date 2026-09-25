"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormField } from "@/components/forms/form-field";
import { Eye, EyeOff, Loader, Login, Warning } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/painel";
  return next;
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const { error: authError } = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
        if (authError) {
          if (authError.status === 429) setError("Muitas tentativas. Aguarde um minuto e tente de novo.");
          else if (authError.status === 403) setError(authError.message ?? "Acesso não permitido.");
          else setError("E-mail ou senha inválidos.");
          return;
        }
      } catch {
        setError("Falha de comunicação com o servidor. Verifique a conexão.");
        return;
      }
      router.replace(safeNext(next));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormField id="email" label="E-mail">
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="login-email"
        />
      </FormField>
      <FormField id="password" label="Senha">
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-12"
            data-testid="login-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-fg-muted hover:text-fg"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </FormField>
      {error ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          <Warning className="size-4 shrink-0" /> {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !email || !password}>
        {pending ? <Loader className="animate-spin-steps" /> : <Login />} Entrar
      </Button>
    </form>
  );
}
