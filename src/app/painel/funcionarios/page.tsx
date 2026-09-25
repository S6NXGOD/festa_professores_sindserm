import { redirect } from "next/navigation";

/** Endereço antigo (a lista agora inclui diretoria e prestadores de serviço). */
export default async function OldEmployeesPage({ searchParams }: PageProps<"/painel/funcionarios">) {
  const query = await searchParams;
  const filtro = typeof query.filtro === "string" ? `?filtro=${encodeURIComponent(query.filtro)}` : "";
  redirect(`/painel/colaboradores${filtro}`);
}
