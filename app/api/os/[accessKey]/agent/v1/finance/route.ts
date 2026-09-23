import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { getFinanceSummary } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

/** Everything the Privat tab shows, for one month (?month=YYYY-MM, default now). */
export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const month = new URL(request.url).searchParams.get("month") ?? undefined;
    return privateJson(await getFinanceSummary(month));
  });
}
