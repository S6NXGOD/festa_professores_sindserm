"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { type AccessMap, ROLE_PRESETS } from "@/domain/access";
import type { StaffRole } from "@/domain/types";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import { createUserAction, resetPasswordAction, updateUserAction } from "@/server/actions/users";
import { AccessEditor } from "./access-editor";

/** Diálogo alto (permissões por área): rola por dentro, também no celular. */
const TALL_DIALOG = "max-h-[92dvh] overflow-y-auto";

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<{ role: StaffRole; access: AccessMap }>({ role: "SECURITY", access: ROLE_PRESETS.SECURITY });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
    setProfile({ role: "SECURITY", access: ROLE_PRESETS.SECURITY });
    setErrors({});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await callAction(createUserAction({ name, email, password, role: profile.role, access: profile.access }));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      playSound("coin");
      toast.success("Usuário criado. No primeiro acesso, a pessoa cria a própria senha.");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent className={TALL_DIALOG}>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Novo usuário da equipe</DialogTitle>
            <DialogDescription>A senha inicial é provisória: no primeiro acesso, a pessoa cria uma senha só dela.</DialogDescription>
          </DialogHeader>
          <FormField id="user-name" label="Nome completo" error={errors.name}>
            <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="user-email" label="E-mail" error={errors.email}>
            <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField id="user-password" label="Senha inicial (provisória)" description="Mínimo de 10 caracteres." error={errors.password}>
            <Input id="user-password" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <AccessEditor role={profile.role} access={profile.access} onChange={setProfile} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} data-testid="create-user-submit">
              {pending ? <Loader className="animate-spin-steps" /> : <UserPlus />} Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditUserDialog({
  user,
  isSelf,
}: {
  user: { userId: string; name: string; email: string; role: StaffRole; access: AccessMap; active: boolean; mustChangePassword: boolean };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(user.name);
  const [active, setActive] = useState(user.active);
  const [mustChangePassword, setMustChangePassword] = useState(user.mustChangePassword);
  const [profile, setProfile] = useState<{ role: StaffRole; access: AccessMap }>({ role: user.role, access: user.access });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await callAction(
        updateUserAction({ userId: user.userId, name, role: profile.role, access: profile.access, active, mustChangePassword }),
      );
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        return;
      }
      playSound("coin");
      toast.success("Usuário atualizado. As permissões valem já no próximo clique da pessoa.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`edit-user-${user.email}`}>
          <Pencil /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent className={TALL_DIALOG}>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <FormField id="edit-name" label="Nome completo">
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <AccessEditor role={profile.role} access={profile.access} onChange={setProfile} disabled={isSelf} />
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <span>
              <span className="block text-sm font-bold text-fg">Pedir nova senha no próximo acesso</span>
              <span className="block text-xs text-fg-muted">A pessoa só usa o sistema depois de criar uma senha só dela.</span>
            </span>
            <Switch checked={mustChangePassword} onCheckedChange={setMustChangePassword} disabled={isSelf} data-testid="must-change-password" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3 text-sm font-semibold text-fg">
            Acesso ativo
            <Switch checked={active} onCheckedChange={setActive} disabled={isSelf} />
          </label>
          {isSelf ? <p className="text-xs text-fg-muted">Você não pode alterar as próprias permissões nem se desativar.</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} data-testid="edit-user-submit">
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
      toast.success(`Senha provisória de ${name} definida. No próximo acesso, ${name.split(" ")[0]} cria a própria.`);
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
          <DialogTitle>Senha provisória</DialogTitle>
          <DialogDescription>
            Nova senha para {name}. As sessões abertas são encerradas e, no próximo acesso, a pessoa cria uma senha só dela.
          </DialogDescription>
        </DialogHeader>
        <Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha provisória (mín. 10 caracteres)" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || password.length < 10}>
            {pending ? <Loader className="animate-spin-steps" /> : <Key />} Definir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
