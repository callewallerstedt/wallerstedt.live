import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseOptionalJson, privateJson, route } from "@/lib/accounting/http";
import { psuFromRequest, syncFinance } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ accessKey: string }> };

/** Pull fresh balances and transactions from the bank now. */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    const auth = await requireAgentOrOwnerSession(request, accessKey, true);
    const body = (await parseOptionalJson(request, 2_000)) as { force?: boolean };
    // The owner's browser is "present"; an agent call counts as unattended.
    const psu = auth.kind === "owner" ? psuFromRequest(request) : undefined;
    return privateJson(await syncFinance({ psu, force: Boolean(body?.force) }));
  });
}
