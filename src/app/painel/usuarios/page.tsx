import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/panel-ui";
import { DeleteUserButton, RequireTrainingButton } from "@/components/staff/user-admin-actions";
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog } from "@/components/staff/user-dialogs";
import { ToneBadge } from "@/components/status/status-badge";
import { isCustomAccess, resolveAccess } from "@/domain/access";
import { ROLE_LABEL } from "@/domain/labels";
import { deskTrainingRequired, gateTrainingRequired } from "@/domain/tutorial";
import { initials } from "@/lib/text";
import { cn } from "@/lib/utils";
import { listStaffUsers } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage() {
  const actor = await requirePageActor("manageUsers");
  const users = await listStaffUsers();
  // Quem registra entradas (fora os administradores) faz o treino relâmpago antes da portaria.
  const trainees = users.filter((u) => u.active && gateTrainingRequired(resolveAccess(u.role, u.permissions)));
  const pendingTraining = trainees.filter((u) => !u.gateTrainingDoneAt).length;
  // Quem entrega kits (fora os administradores) faz o treino da mesa antes de abrir a mesa dos kits.
  const deskTrainees = users.filter((u) => u.active && deskTrainingRequired(resolveAccess(u.role, u.permissions)));
  const pendingDesk = deskTrainees.filter((u) => !u.deskTrainingDoneAt).length;
  return (
    <div>
      <PageHeader
        eyebrow="Acesso ao sistema"
        title="Usuários"
        description="Quem usa o sistema e o que cada pessoa pode fazer, área por área. Colaboradores que só vão à festa (sem usar o sistema) ficam em Colaboradores SINDSERM."
        actions={
          <>
            {trainees.length || deskTrainees.length ? <RequireTrainingButton /> : null}
            <CreateUserDialog />
          </>
        }
      />
      {trainees.length ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-fg-muted" data-testid="training-summary">
          <span className="pixel text-[0.55rem] text-red">Treino da portaria</span>
          {pendingTraining
            ? `${trainees.length - pendingTraining} de ${trainees.length} já fizeram; ${pendingTraining === 1 ? "falta 1 pessoa" : `faltam ${pendingTraining}`} (fazem antes de abrir a portaria).`
            : `Todos os ${trainees.length} da portaria já fizeram.`}
        </p>
      ) : null}
      {deskTrainees.length ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-fg-muted" data-testid="desk-training-summary">
          <span className="pixel text-[0.55rem] text-success-text">Treino da mesa</span>
          {pendingDesk
            ? `${deskTrainees.length - pendingDesk} de ${deskTrainees.length} já fizeram; ${pendingDesk === 1 ? "falta 1 pessoa" : `faltam ${pendingDesk}`} (fazem antes de abrir a mesa dos kits).`
            : `Todos os ${deskTrainees.length} que entregam kits já fizeram.`}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className={cn("flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5", !u.active && "opacity-60")} data-testid="user-row">
              <span className="pixel inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-brand text-[0.6rem] text-white shadow-[0_3px_0_0_var(--brand-strong)]">
                {initials(u.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold text-fg">
                  {u.name}
                  {u.id === actor.userId ? <ToneBadge tone="info">Você</ToneBadge> : null}
                  {!u.active ? <ToneBadge tone="danger">Desativado</ToneBadge> : null}
                  {isCustomAccess(u.role, u.permissions) ? <ToneBadge tone="info">Permissões ajustadas</ToneBadge> : null}
                  {u.mustChangePassword && u.active ? <ToneBadge tone="warning">Senha provisória</ToneBadge> : null}
                  {u.active && gateTrainingRequired(resolveAccess(u.role, u.permissions)) ? (
                    u.gateTrainingDoneAt ? (
                      <ToneBadge tone="success">Treino feito</ToneBadge>
                    ) : (
                      <ToneBadge tone="warning">Treino pendente</ToneBadge>
                    )
                  ) : null}
                  {u.active && deskTrainingRequired(resolveAccess(u.role, u.permissions)) ? (
                    u.deskTrainingDoneAt ? (
                      <ToneBadge tone="success">Mesa: treino feito</ToneBadge>
                    ) : (
                      <ToneBadge tone="warning">Mesa: treino pendente</ToneBadge>
                    )
                  ) : null}
                </p>
                <p className="truncate text-sm text-fg-muted">
                  {u.email} · {ROLE_LABEL[u.role]}
                </p>
              </div>
              <div className="-mt-2 flex w-full gap-1 pl-11 sm:mt-0 sm:w-auto sm:pl-0">
                <EditUserDialog
                  user={{
                    userId: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    access: resolveAccess(u.role, u.permissions),
                    active: u.active,
                    mustChangePassword: u.mustChangePassword,
                  }}
                  isSelf={u.id === actor.userId}
                />
                <ResetPasswordDialog userId={u.id} name={u.name} />
                {u.id !== actor.userId ? <DeleteUserButton userId={u.id} name={u.name} /> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
