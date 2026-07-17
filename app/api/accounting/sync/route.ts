import { requireSyncToken } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { synchronizeAccounting } from "@/lib/accounting/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  return route(async () => {
    requireSyncToken(request);
    const body = await parseJson(request, 3_200_000);
    return privateJson({ ok: true, ...(await synchronizeAccounting(body, request)) });
  });
}
