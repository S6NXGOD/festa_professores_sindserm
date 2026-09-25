import { redirect } from "next/navigation";

/**
 * Endereço antigo da conferência (favoritos e links salvos): a fila de
 * conferência agora é o primeiro filtro de Inscrições, e a de assinaturas,
 * o de Fichas de filiação.
 */
export default async function VerificationQueueRedirect({ searchParams }: PageProps<"/painel/conferencia">) {
  const query = await searchParams;
  redirect(query.fila === "assinatura" ? "/painel/filiacoes?filtro=assinar" : "/painel/inscricoes?filtro=conferir");
}
