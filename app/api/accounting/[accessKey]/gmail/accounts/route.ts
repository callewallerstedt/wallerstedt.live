import { requireOwnerSession } from "@/lib/accounting/auth";
import { gmailConfigured, listGmailAccounts } from "@/lib/accounting/gmail";
import { privateJson, route } from "@/lib/accounting/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({
      ok: true,
      configured: gmailConfigured(),
      accounts: await listGmailAccounts(),
    });
  });
}
