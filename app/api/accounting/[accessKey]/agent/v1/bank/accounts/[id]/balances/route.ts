import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { businessBalances } from "@/lib/accounting/bank";
import { privateJson, route } from "@/lib/accounting/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ accessKey: string; id: string }> }) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({ ok: true, ...await businessBalances(id) });
  });
}
