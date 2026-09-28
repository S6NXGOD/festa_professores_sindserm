import type { Metadata } from "next";
import Link from "next/link";
import { QuickRegistrationForm } from "@/components/gate/quick-registration";
import { ArrowLeft, Building, ClipboardNote, Users } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/rules";
import { maskCpfInput } from "@/lib/cpf";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Cadastro rápido" };

/**
 * Cadastro rápido na portaria, para quem chegou sem inscrição. Vem preenchido com
 * o que foi digitado na busca (?nome= ou ?cpf=). Outras situações (convidado de
 * alguém, quem não é filiado(a)) têm o caminho certo logo abaixo.
 */
export default async function GateQuickRegistrationPage({ searchParams }: PageProps<"/portaria/cadastro">) {
  const actor = await requirePageActor("registerAtEvent");
  const query = await searchParams;
  const initialName = typeof query.nome === "string" ? query.nome.trim().slice(0, 120) : "";
  const cpfDigits = typeof query.cpf === "string" ? query.cpf.replace(/\D/g, "").slice(0, 11) : "";
  const canAffiliate = can(actor.access, "newAffiliation");

  return (
    <div className="space-y-4 pb-28">
      <Button asChild variant="ghost" className="-ml-2">
        <Link href="/portaria">
          <ArrowLeft /> Portaria
        </Link>
      </Button>
      <header>
        <p className="pixel text-[0.55rem] text-red">Cadastro rápido</p>
        <h1 className="display mt-1 text-4xl leading-none text-fg sm:text-5xl">Chegou sem inscrição?</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Para quem <strong className="text-fg">já é filiado(a)</strong>: grave aqui e, na tela seguinte, confira a filiação e registre a
          entrada.
        </p>
      </header>

      <QuickRegistrationForm initialName={initialName} initialCpf={cpfDigits ? maskCpfInput(cpfDigits) : ""} />

      {/* Os outros casos da porta, cada um no seu caminho (sem inscrição nova). */}
      <aside className="space-y-2 rounded-2xl border border-dashed border-line p-4 text-sm text-fg-muted" data-testid="quick-other-cases">
        <p className="text-[0.7rem] font-bold tracking-[0.1em] text-fg-dim uppercase">Não é o caso?</p>
        <p className="flex items-start gap-2">
          <Users className="mt-0.5 size-4 shrink-0 text-red" />
          <span>
            <strong className="text-fg">Convidado(a) de um(a) professor(a):</strong> busque quem convidou e toque em{" "}
            <strong className="text-fg">Cadastrar convidado</strong>.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Building className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <strong className="text-fg">Veio com um(a) colaborador(a), sem kit:</strong> abra o(a) colaborador(a) e toque em{" "}
            <strong className="text-fg">Convidado sem kit</strong>.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <ClipboardNote className="mt-0.5 size-4 shrink-0 text-fg" />
          <span>
            <strong className="text-fg">Ainda não é filiado(a):</strong>{" "}
            {canAffiliate ? (
              <Link href="/painel/filiacoes/nova" className="font-semibold text-red underline underline-offset-4">
                faça a ficha de filiação
              </Link>
            ) : (
              "a ficha de filiação é feita pelo Atendimento"
            )}{" "}
            (com as fotos do RG e do contracheque).
          </span>
        </p>
      </aside>
    </div>
  );
}
