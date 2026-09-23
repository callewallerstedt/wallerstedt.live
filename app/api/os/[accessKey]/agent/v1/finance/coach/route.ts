import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseOptionalJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { coachBrief, runFinanceCoach } from "@/lib/finance/coach";
import { getFinanceSummary } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ accessKey: string }> };

/** The plain-text money brief the coach reads. Handy for other agents too. */
export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const month = new URL(request.url).searchParams.get("month") ?? undefined;
    return privateJson({ ok: true, brief: coachBrief(await getFinanceSummary(month)) });
  });
}

/** Ask the AI coach. { month?, question? } — without a question it refreshes the saved advice. */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(
      z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional(), question: z.string().max(500).optional() }),
      await parseOptionalJson(request, 4_000),
    );
    return privateJson({ ok: true, coach: await runFinanceCoach(input.month, input.question) });
  });
}
