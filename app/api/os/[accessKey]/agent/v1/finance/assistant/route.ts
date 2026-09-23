import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { runFinanceAssistant } from "@/lib/finance/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ accessKey: string }> };

/**
 * Talk to the money assistant; it can change things.
 * { "message": "Lägg alla Elgiganten som företagsutlägg", "month"?: "2026-09" }
 */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(
      z.object({ message: z.string().min(1).max(1000), month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
      await parseJson(request, 4_000),
    );
    return privateJson({ ok: true, ...(await runFinanceAssistant(input.message, input.month)) });
  });
}
