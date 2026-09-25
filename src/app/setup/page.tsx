import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { BootstrapForm } from "@/components/auth/bootstrap-form";
import { can } from "@/domain/access";
import { getConfig, hasUsers } from "@/server/queries/config";
import { getActor, homePathFor } from "@/server/session";

export const metadata: Metadata = { title: "Configuração inicial" };

export default async function SetupPage() {
  const [usersExist, actor, config] = await Promise.all([hasUsers(), getActor(), getConfig()]);
  if (usersExist) {
    if (actor && can(actor.access, "manageSettings") && !config) redirect("/setup/evento");
    redirect(actor ? homePathFor(actor.access) : "/entrar");
  }
  return (
    <AuthShell title="Primeiro acesso" kicker="Player 1 start" subtitle="Crie a conta do primeiro administrador do sistema.">
      <BootstrapForm />
    </AuthShell>
  );
}
