import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { businessTransactions } from "@/lib/accounting/bank";
import { reportPeriod } from "@/lib/accounting/query";
import { privateJson, route } from "@/lib/accounting/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request, { params }: { params: Promise<{ accessKey: string; id: string }> }) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const period = reportPeriod(new URL(request.url).searchParams);
    return privateJson({ ok: true, ...await businessTransactions(id, period.dateFrom, period.dateTo) });
  });
}
