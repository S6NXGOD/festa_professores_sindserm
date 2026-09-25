import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/panel-ui";
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog } from "@/components/staff/user-dialogs";
import { ToneBadge } from "@/components/status/status-badge";
import { ROLE_LABEL } from "@/domain/labels";
import { initials } from "@/lib/text";
import { cn } from "@/lib/utils";
import { listStaffUsers } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage() {
  const actor = await requirePageActor("manageUsers");
  const users = await listStaffUsers();
  return (
    <div>
      <PageHeader
        eyebrow="Acesso ao sistema"
        title="Usuários"
        description="Logins de Administração, Atendimento e Segurança/Recepção. Quem só trabalha na festa (sem usar o sistema) vai em Funcionários da festa."
        actions={<CreateUserDialog />}
      />
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className={cn("flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5", !u.active && "opacity-60")}>
              <span className="pixel inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-brand text-[0.6rem] text-white shadow-[0_3px_0_0_var(--brand-strong)]">
                {initials(u.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold text-fg">
                  {u.name}
                  {u.id === actor.userId ? <ToneBadge tone="info">Você</ToneBadge> : null}
                  {!u.active ? <ToneBadge tone="danger">Desativado</ToneBadge> : null}
                </p>
                <p className="truncate text-sm text-fg-muted">
                  {u.email} · {ROLE_LABEL[u.role]}
                </p>
              </div>
              <div className="-mt-2 flex w-full gap-1 pl-11 sm:mt-0 sm:w-auto sm:pl-0">
                <EditUserDialog user={{ userId: u.id, name: u.name, role: u.role, active: u.active, email: u.email }} isSelf={u.id === actor.userId} />
                <ResetPasswordDialog userId={u.id} name={u.name} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
