import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { ArrowLeft } from "@/components/icons/pixel";
import { ROLE_LABEL } from "@/domain/labels";
import { homePathFor, requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const actor = await requirePageActor();
  return (
    <AuthShell title="Trocar senha" kicker="Minha conta" subtitle={`${actor.name} · ${ROLE_LABEL[actor.role]}`}>
      <ChangePasswordForm />
      <Link
        href={homePathFor(actor.role)}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-red hover:underline"
      >
        <ArrowLeft className="size-4" /> Voltar
      </Link>
    </AuthShell>
  );
}
