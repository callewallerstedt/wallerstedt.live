export class AccountingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AccountingError";
  }
}

export class AccountingConflictError extends AccountingError {
  constructor(message: string, details?: unknown) {
    super(message, 409, "version_conflict", details);
    this.name = "AccountingConflictError";
  }
}

export function isAccountingError(error: unknown): error is AccountingError {
  return error instanceof AccountingError;
}

/** Safe for logs: deliberately excludes message, stack, request, response, and input data. */
export function redactedErrorDiagnostic(error: unknown) {
  if (!error || typeof error !== "object") return { name: typeof error };
  const value = error as { name?: unknown; code?: unknown; status?: unknown };
  return {
    name: typeof value.name === "string" ? value.name.slice(0, 100) : "Error",
    ...(typeof value.code === "string" || typeof value.code === "number"
      ? { code: String(value.code).slice(0, 100) }
      : {}),
    ...(typeof value.status === "number" ? { status: value.status } : {}),
  };
}
