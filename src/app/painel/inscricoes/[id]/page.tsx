import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { registration } from "@/server/db/schema";
import { requirePageActor } from "@/server/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A inscrição e o cadastro da pessoa viraram uma tela só (a do cadastro): este
 * endereço antigo leva para lá, com o aviso de "inscrição gravada" quando vem
 * do "Cadastrar na hora".
 */
export default async function RegistrationRedirect({ params, searchParams }: PageProps<"/painel/inscricoes/[id]">) {
  await requirePageActor("viewRegistrations");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [row] = await db.select({ memberId: registration.memberPersonId }).from(registration).where(eq(registration.id, id)).limit(1);
  if (!row) notFound();
  redirect(`/painel/participantes/${row.memberId}${query.nova === "1" ? "?nova=1" : ""}`);
}
