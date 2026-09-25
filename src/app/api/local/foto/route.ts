import { revalidatePath } from "next/cache";
import { errorResponse, isSameOrigin } from "@/server/request";
import { DomainError } from "@/server/services/errors";
import { PHOTO_MAX_BYTES, saveEventPhoto } from "@/server/services/venue";
import { requireActionActor } from "@/server/session";

/*
 * Envio da foto do local por uma rota própria (e não por Server Action): as
 * Server Actions rodam uma de cada vez no navegador, então um envio lento
 * travava as outras ações e até a navegação do painel. Aqui o navegador mostra
 * o progresso e desiste com uma mensagem clara se passar do tempo.
 */

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Envio não permitido." }, { status: 403 });
  try {
    const actor = await requireActionActor();
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > PHOTO_MAX_BYTES + 64 * 1024) throw new DomainError("VALIDATION", "A foto precisa ter até 8 MB.");
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("VALIDATION", "Escolha uma foto.");
    const saved = await saveEventPhoto(actor, { bytes: Buffer.from(await file.arrayBuffer()), type: file.type });
    revalidatePath("/", "layout");
    return Response.json({ ok: true, ...saved });
  } catch (error) {
    return errorResponse(error, "Foto do local", "Não foi possível salvar a foto. Tente de novo.");
  }
}
