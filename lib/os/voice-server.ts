import { z } from "zod";
import { AccountingError } from "@/lib/accounting/errors";
import { parseOptionalJson } from "@/lib/accounting/http";

export async function voiceInput<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.output<T>> {
  const result = schema.safeParse(await parseOptionalJson(request, 64_000));
  if (!result.success) throw new AccountingError("Invalid voice request.", 400, "voice_validation_error");
  return result.data;
}
export async function voiceFetch(url: string, init: RequestInit) {
  try {
    return await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  } catch {
    return null;
  }
}
