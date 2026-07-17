import { NextResponse } from "next/server";
import {
  AccountingError,
  isAccountingError,
  redactedErrorDiagnostic,
} from "./errors";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie, Authorization",
} as const;

export function privateJson(data: unknown, init?: number | ResponseInit) {
  const responseInit: ResponseInit =
    typeof init === "number" ? { status: init } : { ...(init ?? {}) };
  const headers = new Headers(responseInit.headers);
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) {
    headers.set(name, value);
  }
  return NextResponse.json(data, { ...responseInit, headers });
}

export function privateStream(
  body: BodyInit | null,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) {
    headers.set(name, value);
  }
  return new NextResponse(body, { ...init, headers });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AccountingError(
      "A same-origin browser request is required.",
      403,
      "origin_required",
    );
  }

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(request.url).origin;
  } catch {
    throw new AccountingError("Invalid request URL.", 400, "invalid_request_url");
  }

  if (origin !== expectedOrigin) {
    throw new AccountingError(
      "Cross-origin accounting mutations are not allowed.",
      403,
      "origin_mismatch",
    );
  }
}

export async function parseJson(request: Request, maxBytes = 256_000) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new AccountingError("Request body is too large.", 413, "body_too_large");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AccountingError("Request body must be valid JSON.", 400, "invalid_json");
  }
  return value;
}

function publicMessage(error: AccountingError) {
  if (error.status >= 500) return "The accounting service is temporarily unavailable.";
  return error.message;
}

export function accountingErrorResponse(error: unknown) {
  if (isAccountingError(error)) {
    return privateJson(
      {
        ok: false,
        error: error.code,
        message: publicMessage(error),
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      error.status,
    );
  }

  console.error("Unhandled accounting route error", redactedErrorDiagnostic(error));
  return privateJson(
    {
      ok: false,
      error: "internal_error",
      message: "The accounting service is temporarily unavailable.",
    },
    500,
  );
}

export async function route<T extends Response>(handler: () => Promise<T>) {
  try {
    return await handler();
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
