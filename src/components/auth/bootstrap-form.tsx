"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { type FieldPath, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { Key, Loader, Shield } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type BootstrapAdminInput, bootstrapAdminSchema } from "@/domain/schemas";
import { authClient } from "@/lib/auth-client";
import { callAction } from "@/lib/call-action";
import { bootstrapAdminAction } from "@/server/actions/setup";

export function BootstrapForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<BootstrapAdminInput>({
    resolver: zodResolver(bootstrapAdminSchema),
    mode: "onTouched",
    defaultValues: { setupToken: "", name: "", email: "", password: "", passwordConfirmation: "" },
  });
  const { register, handleSubmit, formState, setError } = form;
  const errors = formState.errors;

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await callAction(bootstrapAdminAction(values));
      if (!result.ok) {
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(path as FieldPath<BootstrapAdminInput>, { message });
        }
        return;
      }
      const { error } = await authClient.signIn.email({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      if (error) {
        toast.success("Administrador criado. Faça login para continuar.");
        router.replace("/entrar");
        return;
      }
      toast.success("Administrador criado! Agora configure o evento.");
      router.replace("/setup/evento");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="flex items-start gap-3 rounded-lg border border-red/40 bg-brand-soft p-4 text-sm text-fg">
        <Shield className="mt-0.5 size-5 shrink-0 text-red" />
        <p>
          Por segurança, informe o <strong>SETUP_TOKEN</strong> definido no arquivo <code>.env.local</code> do servidor.
          Esta tela só funciona enquanto nenhum usuário existir.
        </p>
      </div>
      <FormField id="setupToken" label="Token de configuração" error={errors.setupToken?.message}>
        <Input id="setupToken" type="password" autoComplete="off" {...register("setupToken")} />
      </FormField>
      <FormField id="name" label="Seu nome completo" error={errors.name?.message}>
        <Input id="name" autoComplete="name" {...register("name")} />
      </FormField>
      <FormField id="email" label="E-mail" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="password" label="Senha" description="Mínimo de 10 caracteres." error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        </FormField>
        <FormField id="passwordConfirmation" label="Confirme a senha" error={errors.passwordConfirmation?.message}>
          <Input
            id="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            {...register("passwordConfirmation")}
          />
        </FormField>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader className="animate-spin-steps" /> : <Key />} Criar administrador
      </Button>
    </form>
  );
}
