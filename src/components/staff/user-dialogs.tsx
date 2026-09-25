"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, type FieldPath, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { Key, Loader, Pencil, UserPlus } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/domain/labels";
import { type CreateUserInput, createUserSchema, type UpdateUserInput, updateUserSchema } from "@/domain/schemas";
import { STAFF_ROLES, type StaffRole } from "@/domain/types";
import { cn } from "@/lib/utils";
import { callAction } from "@/lib/call-action";
import { createUserAction, resetPasswordAction, updateUserAction } from "@/server/actions/users";

function RolePicker({ value, onChange, disabled }: { value: StaffRole; onChange: (role: StaffRole) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Perfil">
      {STAFF_ROLES.map((role) => (
        <button
          key={role}
          type="button"
          role="radio"
          aria-checked={value === role}
          disabled={disabled}
          onClick={() => onChange(role)}
          className={cn(
            "rounded-xl border-2 border-line-strong bg-surface-2 p-3 text-left transition-[border-color,background-color] disabled:opacity-50",
            value === role && "border-red bg-brand-soft",
          )}
        >
          <span className="block text-sm font-bold text-fg">{ROLE_LABEL[role]}</span>
          <span className="block text-xs text-fg-muted">{ROLE_DESCRIPTION[role]}</span>
        </button>
      ))}
    </div>
  );
}

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", role: "SECURITY", password: "" },
  });
  const e = form.formState.errors;

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await callAction(createUserAction(values));
      if (!result.ok) {
        toast.error(result.error);
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) form.setError(path as FieldPath<CreateUserInput>, { message });
        return;
      }
      toast.success("Usuário criado. Informe a senha inicial à pessoa.");
      form.reset();
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Novo usuário da equipe</DialogTitle>
            <DialogDescription>A pessoa pode trocar a senha depois em “Trocar senha”.</DialogDescription>
          </DialogHeader>
          <FormField id="user-name" label="Nome completo" error={e.name?.message}>
            <Input id="user-name" {...form.register("name")} />
          </FormField>
          <FormField id="user-email" label="E-mail" error={e.email?.message}>
            <Input id="user-email" type="email" {...form.register("email")} />
          </FormField>
          <FormField id="user-password" label="Senha inicial" description="Mínimo de 10 caracteres." error={e.password?.message}>
            <Input id="user-password" type="text" autoComplete="new-password" {...form.register("password")} />
          </FormField>
          <Controller control={form.control} name="role" render={({ field }) => <RolePicker value={field.value} onChange={field.onChange} />} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader className="animate-spin-steps" /> : <UserPlus />} Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditUserDialog({ user, isSelf }: { user: UpdateUserInput & { email: string }; isSelf: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { userId: user.userId, name: user.name, role: user.role, active: user.active },
  });
  const e = form.formState.errors;

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await callAction(updateUserAction(values));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Usuário atualizado.");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <FormField id="edit-name" label="Nome completo" error={e.name?.message}>
            <Input id="edit-name" {...form.register("name")} />
          </FormField>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => <RolePicker value={field.value} onChange={field.onChange} disabled={isSelf} />}
          />
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3 text-sm font-semibold text-fg">
                Acesso ativo
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSelf} />
              </label>
            )}
          />
          {isSelf ? <p className="text-xs text-fg-muted">Você não pode alterar o próprio perfil nem se desativar.</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader className="animate-spin-steps" /> : null} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await callAction(resetPasswordAction({ userId, password }));
      if (!result.ok) {
        toast.error(result.fieldErrors?.password ?? result.error);
        return;
      }
      toast.success(`Senha de ${name} redefinida. As sessões dele(a) foram encerradas.`);
      setPassword("");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Key /> Senha
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>Nova senha para {name}. As sessões abertas serão encerradas.</DialogDescription>
        </DialogHeader>
        <Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nova senha (mín. 10 caracteres)" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || password.length < 10}>
            {pending ? <Loader className="animate-spin-steps" /> : <Key />} Redefinir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
