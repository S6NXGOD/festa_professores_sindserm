export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "CPF_TAKEN"
  | "REGISTRATION_CLOSED"
  | "ENTRY_BLOCKED"
  | "KIT_NOT_AVAILABLE"
  | "OUT_OF_STOCK"
  | "ALREADY_DELIVERED"
  | "GUEST_CANNOT_RECEIVE_KIT"
  | "BENEFICIARY_LOCKED"
  | "EVENT_NOT_STARTED";

/** Erro de regra de negócio com mensagem segura para exibir ao usuário. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: DomainErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
}

/** Extrai o erro original do PostgreSQL (o Drizzle pode encapsulá-lo em `cause`). */
export function pgErrorOf(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && current !== null) {
      const candidate = current as PgErrorLike & { cause?: unknown };
      if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate;
      current = candidate.cause;
    } else break;
  }
  return null;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = pgErrorOf(error);
  if (pg?.code !== "23505") return false;
  return constraint ? pg.constraint === constraint : true;
}

export function isCheckViolation(error: unknown, constraint?: string): boolean {
  const pg = pgErrorOf(error);
  if (pg?.code !== "23514") return false;
  return constraint ? pg.constraint === constraint : true;
}
