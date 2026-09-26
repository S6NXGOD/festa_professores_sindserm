import { redirect } from "next/navigation";

/**
 * "Participantes" virou parte de "Inscrições" (a busca acha também convidados).
 * Endereços antigos levam ao lugar equivalente.
 */
const TARGET: Record<string, string> = {
  employees: "/painel/colaboradores",
  present: "/painel/entradas",
  absent: "/painel/inscricoes?filtro=ausentes",
  pending: "/painel/inscricoes?filtro=conferir",
};

export default async function OldParticipantsPage({ searchParams }: PageProps<"/painel/participantes">) {
  const query = await searchParams;
  const filtro = typeof query.filtro === "string" ? query.filtro : "";
  const q = typeof query.q === "string" && query.q.trim() ? query.q.trim() : null;
  const target = TARGET[filtro] ?? "/painel/inscricoes?filtro=todas";
  redirect(q && target.startsWith("/painel/inscricoes") ? `${target}&q=${encodeURIComponent(q)}` : target);
}
