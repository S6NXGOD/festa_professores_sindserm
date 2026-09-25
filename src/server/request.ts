import "server-only";
import { DomainError } from "@/server/services/errors";

/** Só aceita envios do próprio sistema (proteção contra CSRF, como nas Server Actions). */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const STATUS: Partial<Record<DomainError["code"], number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  RATE_LIMITED: 429,
};

/** Resposta JSON de erro para as rotas de envio (mensagem segura para a tela). */
export function errorResponse(error: unknown, context: string, fallback: string) {
  if (error instanceof DomainError) {
    return Response.json({ error: error.message, fieldErrors: error.fieldErrors }, { status: STATUS[error.code] ?? 400 });
  }
  console.error(`${context}:`, error instanceof Error ? error.name : typeof error);
  return Response.json({ error: fallback }, { status: 500 });
}
