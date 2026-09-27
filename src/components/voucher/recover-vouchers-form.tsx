"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormField } from "@/components/forms/form-field";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import { Loader, QrCode, Warning } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { voucherRecoverySchema } from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { recoverVouchers } from "@/server/actions/registration";

/** Pede os vouchers ao servidor (CPF + WhatsApp) e abre a página do grupo. */
function useRecoverVouchers() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function recover(cpf: string, whatsapp: string) {
    setError(null);
    startTransition(async () => {
      const result = await callAction(recoverVouchers({ cpf, whatsapp }));
      if (result.ok) {
        playSound("powerup");
        router.push(`/vouchers/${result.data.accessToken}?recuperado=1`);
        return;
      }
      playSound("error");
      setError(result.error);
    });
  }

  return { recover, pending, error };
}

function RecoverError({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm font-semibold text-fg"
      role="alert"
      data-testid="recover-error"
    >
      <Warning className="mt-0.5 size-4 shrink-0 text-danger" />
      <span>{children}</span>
    </p>
  );
}

/** Página "Meus vouchers": CPF + WhatsApp da inscrição → vouchers do grupo (link novo). */
export function RecoverVouchersForm({ className }: { className?: string }) {
  const [cpf, setCpf] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { recover, pending, error } = useRecoverVouchers();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = voucherRecoverySchema.safeParse({ cpf, whatsapp });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      setFieldErrors(errors);
      playSound("error");
      return;
    }
    setFieldErrors({});
    recover(cpf, whatsapp);
  }

  return (
    <form onSubmit={submit} noValidate className={cn("grid gap-4", className)} data-testid="recover-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="recover-cpf" label="CPF" error={fieldErrors.cpf}>
          <CpfInput id="recover-cpf" value={cpf} onChange={setCpf} aria-invalid={Boolean(fieldErrors.cpf)} data-testid="recover-cpf" />
        </FormField>
        <FormField id="recover-whatsapp" label="WhatsApp da inscrição" error={fieldErrors.whatsapp}>
          <PhoneInput
            id="recover-whatsapp"
            value={whatsapp}
            onChange={setWhatsapp}
            aria-invalid={Boolean(fieldErrors.whatsapp)}
            data-testid="recover-whatsapp"
          />
        </FormField>
      </div>
      {error ? <RecoverError>{error}</RecoverError> : null}
      <Button type="submit" size="xl" disabled={pending} className="w-full" data-testid="recover-submit">
        {pending ? <Loader className="animate-spin-steps" /> : <QrCode />}
        {pending ? "Procurando a sua fita..." : "Recuperar meus vouchers"}
      </Button>
      <p className="text-center text-xs leading-relaxed text-fg-dim">
        Por segurança, sai um link novo e o anterior para de funcionar. Imagens de voucher que você já salvou continuam valendo.
      </p>
    </form>
  );
}

/**
 * Na inscrição, quando o CPF já está inscrito: quase sempre é a própria pessoa
 * que perdeu os vouchers. Um toque abre os vouchers com o CPF e o WhatsApp que
 * ela acabou de digitar (sem formulário dentro do formulário).
 */
export function CpfTakenRecovery({ cpf, whatsapp }: { cpf: string; whatsapp: string }) {
  const { recover, pending, error } = useRecoverVouchers();
  return (
    <div className="rounded-xl border border-red/45 bg-red/10 p-4" data-testid="cpf-taken-recovery">
      <p className="flex items-center gap-2 font-bold text-fg">
        <QrCode className="size-5 shrink-0 text-red" /> Esse CPF já está inscrito na festa.
      </p>
      <p className="mt-1 text-sm text-fg-muted">Foi você? Abra os seus vouchers com o CPF e o WhatsApp que você digitou aqui.</p>
      {error ? (
        <div className="mt-3">
          <RecoverError>
            {error}{" "}
            <Link href="/vouchers" className="font-bold whitespace-nowrap text-fg underline underline-offset-4">
              Tentar com outro WhatsApp
            </Link>
          </RecoverError>
        </div>
      ) : null}
      <Button type="button" onClick={() => recover(cpf, whatsapp)} disabled={pending} className="mt-3 w-full sm:w-auto" data-testid="cpf-taken-open">
        {pending ? <Loader className="animate-spin-steps" /> : <QrCode />} Abrir meus vouchers
      </Button>
    </div>
  );
}
