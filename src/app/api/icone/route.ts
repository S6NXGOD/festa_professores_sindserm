import { revalidatePath } from "next/cache";
import { errorResponse, isSameOrigin } from "@/server/request";
import { DomainError } from "@/server/services/errors";
import { ICON_MAX_BYTES, saveSiteIcon } from "@/server/services/site-icon";
import { requireActionActor } from "@/server/session";

/* Envio do ícone do site: rota própria (fora da fila das Server Actions), como a foto do local. */

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Envio não permitido." }, { status: 403 });
  try {
    const actor = await requireActionActor();
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > ICON_MAX_BYTES + 64 * 1024) throw new DomainError("VALIDATION", "A imagem precisa ter até 8 MB.");
    const form = await request.formData();
    const file = form.get("icon");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("VALIDATION", "Escolha uma imagem.");
    const saved = await saveSiteIcon(actor, { bytes: Buffer.from(await file.arrayBuffer()), type: file.type });
    revalidatePath("/", "layout");
    return Response.json({ ok: true, ...saved });
  } catch (error) {
    return errorResponse(error, "Ícone do site", "Não foi possível salvar o ícone. Tente de novo.");
  }
}
