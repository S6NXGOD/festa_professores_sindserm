import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { DomainError, pgErrorOf } from "@/server/services/errors";
import type { ActionResult } from "@/lib/action-result";

/**
 * Descrição do erro para o log do servidor. Mensagens de consultas ao banco
 * incluem os parâmetros (dados pessoais), então nesses casos registra apenas
 * o tipo e o código do erro.
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return `valor lançado do tipo ${typeof error}`;
  const pg = pgErrorOf(error);
  if (pg) return `${error.name} (postgres ${pg.code}${pg.constraint ? ` ${pg.constraint}` : ""})`;
  const cause = error.cause as { code?: unknown; name?: unknown } | undefined;
  if (error.name === "DrizzleQueryError" || cause) {
    const code = typeof cause?.code === "string" ? cause.code : typeof cause?.name === "string" ? cause.name : "?";
    return `${error.name} (${code})`;
  }
  const frames = error.stack?.split("\n").slice(1, 6).join("\n") ?? "";
  return `${error.name}: ${error.message.slice(0, 200)}\n${frames}`;
}

function zodFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * Executa a lógica de uma server action convertendo erros em um resultado
 * serializável e seguro (sem vazar detalhes internos ao cliente).
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof DomainError) {
      return { ok: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors };
    }
    if (error instanceof ZodError) {
      return {
        ok: false,
        error: "Revise os campos destacados.",
        code: "VALIDATION",
        fieldErrors: zodFieldErrors(error),
      };
    }
    // Nunca registrar payloads nem parâmetros de consulta (podem conter dados pessoais).
    console.error("[action] erro inesperado:", describeError(error));
    return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
  }
}
