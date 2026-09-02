import { z } from "zod";

import {
  authenticatePassword,
  setSessionCookie,
} from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { configuredOsAccessKey } from "@/lib/os/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route(async () => {
    const accessKey = configuredOsAccessKey();
    if (!accessKey) {
      throw new AccountingError(
        "ACCOUNTING_ACCESS_KEY is not configured.",
        503,
        "accounting_not_configured",
      );
    }
    const body = parseWithSchema(
      z.object({ password: z.string().min(1).max(4096) }),
      await parseJson(request, 16_000),
    );
    const token = await authenticatePassword(request, accessKey, body.password);
    const response = privateJson({ ok: true, authenticated: true });
    setSessionCookie(response, token);
    return response;
  });
}
