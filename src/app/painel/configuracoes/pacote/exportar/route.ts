import { exportFestaPackage } from "@/server/services/festa-package";
import { errorResponse, isSameOrigin } from "@/server/request";
import { requireActionActor } from "@/server/session";

/*
 * Gera o pacote de mudança desta festa (equipe, colaboradores e cortesias,
 * filiações conferidas), trancado com a senha que o administrador escolhe.
 * Rota POST (e não server action): o arquivo volta como download.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Envio não permitido." }, { status: 403 });
  try {
    const actor = await requireActionActor();
    const body = (await request.json().catch(() => ({}))) as { passphrase?: unknown };
    const { content, counts } = await exportFestaPackage(actor, String(body.passphrase ?? ""));
    const day = new Date().toISOString().slice(0, 10);
    return new Response(content, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="pacote-festa-${day}.festa"`,
        "Cache-Control": "private, no-store",
        "X-Pacote-Contagem": JSON.stringify(counts),
      },
    });
  } catch (error) {
    return errorResponse(error, "Pacote de mudança (gerar)", "Não foi possível gerar o pacote.");
  }
}
