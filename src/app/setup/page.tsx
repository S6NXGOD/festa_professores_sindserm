import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { BootstrapForm } from "@/components/auth/bootstrap-form";
import { getConfig, hasUsers } from "@/server/queries/config";
import { getActor } from "@/server/session";

export const metadata: Metadata = { title: "Configuração inicial" };

export default async function SetupPage() {
  const [usersExist, actor, config] = await Promise.all([hasUsers(), getActor(), getConfig()]);
  if (usersExist) {
    if (actor?.role === "ADMIN" && !config) redirect("/setup/evento");
    redirect(actor ? "/painel" : "/entrar");
  }
  return (
    <AuthShell title="Primeiro acesso" kicker="Player 1 start" subtitle="Crie a conta do primeiro administrador do sistema.">
      <BootstrapForm />
    </AuthShell>
  );
}
