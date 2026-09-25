import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { ArrowLeft, Shield } from "@/components/icons/pixel";
import { ROLE_LABEL } from "@/domain/labels";
import { homePathFor, requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const actor = await requirePageActor(undefined, { passwordChange: true });
  const forced = actor.mustChangePassword;
  const home = homePathFor(actor.access);
  return (
    <AuthShell
      title={forced ? "Crie a sua senha" : "Trocar senha"}
      kicker={forced ? "Primeiro acesso" : "Minha conta"}
      subtitle={`${actor.name} · ${ROLE_LABEL[actor.role]}`}
    >
      {forced ? (
        <p className="mb-5 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-fg" data-testid="forced-password-notice">
          <Shield className="mt-0.5 size-5 shrink-0 text-warning" />
          <span>
            A senha que você recebeu é <strong>provisória</strong>. Crie uma senha só sua para continuar: nem quem criou o seu acesso vai saber
            qual é.
          </span>
        </p>
      ) : null}
      <ChangePasswordForm forced={forced} />
      {forced ? null : home === "/conta" ? (
        <p className="mt-6 text-sm text-fg-muted">Seu usuário ainda não tem acesso a nenhuma área. Fale com quem administra o sistema.</p>
      ) : (
        <Link href={home} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-red hover:underline">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
      )}
    </AuthShell>
  );
}
