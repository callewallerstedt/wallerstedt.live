import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { reconciliationSchema, reconcileAccounting } from "@/lib/accounting/reconciliation";
import { parseWithSchema } from "@/lib/accounting/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ accessKey: string }> }) {
  return route(async () => {
    await requireAgentOrOwnerSession(request, (await params).accessKey, true);
    const input = parseWithSchema(reconciliationSchema, await parseJson(request, 2_000_000));
    return privateJson({ ok: true, ...await reconcileAccounting(input) });
  });
}
