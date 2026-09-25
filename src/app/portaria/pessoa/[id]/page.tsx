import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GatePersonClient } from "@/components/gate/gate-person-client";
import { ArrowLeft } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { loadGateView } from "@/server/services/gate-view";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Pessoa" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GatePersonPage({ params, searchParams }: PageProps<"/portaria/pessoa/[id]">) {
  const actor = await requirePageActor("checkIn");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const view = await loadGateView(db, id, actor.role);
  if (!view) notFound();
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="-ml-2">
        <Link href="/portaria">
          <ArrowLeft /> Portaria
        </Link>
      </Button>
      {/* ?entrar=1: vindo da ficha assinada na hora, já pergunta se registra a entrada. */}
      <GatePersonClient key={view.personId} view={view} personBasePath="/portaria/pessoa" promptEntryOnLoad={query.entrar === "1"} />
    </div>
  );
}
