import { revalidatePath } from "next/cache";
import { DomainError } from "@/server/services/errors";
import { importFestaPackage, previewFestaPackage } from "@/server/services/festa-package";
import { errorResponse, isSameOrigin } from "@/server/request";
import { requireActionActor } from "@/server/session";

/*
 * Traz o pacote de mudança de outra festa: primeiro a prévia (o que vem, sem
 * gravar nada); com `confirm`, importa. Rota POST (e não server action): a
 * importação leva alguns segundos e não pode travar as outras ações da tela.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Envio não permitido." }, { status: 403 });
  try {
    const actor = await requireActionActor();
    const body = (await request.json().catch(() => ({}))) as { content?: unknown; passphrase?: unknown; confirm?: unknown };
    const content = String(body.content ?? "");
    const passphrase = String(body.passphrase ?? "");
    if (content.length > 20_000_000) throw new DomainError("VALIDATION", "Arquivo grande demais para um pacote de festa.");
    if (body.confirm !== true) return Response.json({ preview: await previewFestaPackage(actor, content, passphrase) });
    const summary = await importFestaPackage(actor, content, passphrase);
    revalidatePath("/painel", "layout");
    return Response.json({ summary });
  } catch (error) {
    return errorResponse(error, "Pacote de mudança (importar)", "Não foi possível importar o pacote.");
  }
}
