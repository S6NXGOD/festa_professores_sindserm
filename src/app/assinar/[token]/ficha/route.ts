import { getAffiliationForm } from "@/server/queries/panel";
import { buildFichaPdf, fichaFileName } from "@/server/pdf/ficha-pdf";
import { consumeRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { clientIp } from "@/server/session";
import { readSigningToken } from "@/server/signing-link";

/*
 * A ficha de filiação em PDF, para a pessoa assinar pelo gov.br. Só com o link
 * assinado (mandado pela equipe ou aberto dos vouchers) e só enquanto a ficha
 * espera assinatura. Tem dados pessoais: nada de cache nem indexação.
 */

const PRIVATE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: RouteContext<"/assinar/[token]/ficha">) {
  const { token } = await context.params;
  const limit = await consumeRateLimit(RATE_LIMITS.voucherView, await clientIp());
  if (!limit.allowed) return new Response("Muitas tentativas. Aguarde alguns minutos.", { status: 429, headers: PRIVATE });
  const formId = readSigningToken(token);
  const data = formId ? await getAffiliationForm(formId) : null;
  if (!data) return new Response("Link inválido ou vencido. Fale com a organização.", { status: 404, headers: PRIVATE });
  if (data.form.status !== "DRAFT") return new Response("Esta ficha não está mais esperando assinatura.", { status: 410, headers: PRIVATE });
  const pdf = await buildFichaPdf(data.form);
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...PRIVATE,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fichaFileName(data.form.fullName)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
