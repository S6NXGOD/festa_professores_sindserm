import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { HelpLine } from "@/components/help/help";
import { hasUsers } from "@/server/queries/config";
import { getActor, homePathFor } from "@/server/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const [query, actor, usersExist] = await Promise.all([searchParams, getActor(), hasUsers()]);
  if (!usersExist) redirect("/setup");
  if (actor) redirect(homePathFor(actor.role));
  const next = typeof query.next === "string" ? query.next : undefined;
  return (
    <AuthShell title="Entrar" subtitle="Organização, atendimento e portaria.">
      <LoginForm next={next} />
      <HelpLine
        lead="Esqueceu a senha?"
        topic="entrar no sistema da equipe (esqueci a senha)"
        className="mt-5 justify-center text-xs"
      />
      <p className="mt-4 text-center text-xs text-fg-dim">
        Participantes não precisam de login.{" "}
        <Link href="/" className="font-semibold text-red underline-offset-4 hover:underline">
          Ir para a inscrição
        </Link>
      </p>
    </AuthShell>
  );
}
