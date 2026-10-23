import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { accountingOpenApi } from "@/lib/accounting/agent-contract";
import { privateJson, route } from "@/lib/accounting/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ accessKey: string }> }) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson(accountingOpenApi(`/api/accounting/${encodeURIComponent(accessKey)}/agent/v1`));
  });
}
