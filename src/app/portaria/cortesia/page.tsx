import type { Metadata } from "next";
import Link from "next/link";
import { QuickCourtesyForm } from "@/components/gate/quick-courtesy";
import { QuickModeTabs } from "@/components/gate/quick-mode-tabs";
import { ArrowLeft } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/rules";
import { maskCpfInput } from "@/lib/cpf";
import { db } from "@/server/db";
import { listCourtesyInviters } from "@/server/services/employees";
import { getStockOverview } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Cortesia na portaria" };

/**
 * Cortesia feita na hora, na portaria: para quem a organização mandou entrar e
 * não está em lista nenhuma. Só para quem tem "Cortesia na portaria" (ou edita
 * Colaboradores e cortesias). Vem preenchida com o que foi digitado na busca.
 */
export default async function GateCourtesyPage({ searchParams }: PageProps<"/portaria/cortesia">) {
  const actor = await requirePageActor("createCourtesyAtGate");
  const query = await searchParams;
  const initialName = typeof query.nome === "string" ? query.nome.trim().slice(0, 120) : "";
  const cpfDigits = typeof query.cpf === "string" ? query.cpf.replace(/\D/g, "").slice(0, 11) : "";
  const [inviters, stock] = await Promise.all([listCourtesyInviters(db), getStockOverview(db)]);
  // O estoque dos colaboradores some do resumo quando está zerado e sem uso: aí a cortesia entra sem kit.
  const employeeStock = stock ? (stock.pools.find((pool) => pool.pool === "EMPLOYEE")?.available ?? 0) : null;

  return (
    <div className="space-y-4 pb-28">
      <Button asChild variant="ghost" className="-ml-2">
        <Link href="/portaria">
          <ArrowLeft /> Portaria
        </Link>
      </Button>
      <QuickModeTabs current="courtesy" canRegister={can(actor.access, "registerAtEvent")} canCourtesy name={initialName} />
      <header>
        <p className="pixel text-[0.55rem] text-[#ff8fd0]">Cortesia na portaria</p>
        <h1 className="display mt-1 text-4xl leading-none text-fg sm:text-5xl">Entra como cortesia?</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Para quem a <strong className="text-fg">organização mandou entrar</strong> e não está em lista nenhuma. Grave aqui e, na tela
          seguinte, confirme a entrada. Fica na auditoria com o seu nome.
        </p>
      </header>

      <QuickCourtesyForm
        initialName={initialName}
        initialCpf={cpfDigits ? maskCpfInput(cpfDigits) : ""}
        inviters={inviters}
        employeeStock={employeeStock}
      />
    </div>
  );
}
