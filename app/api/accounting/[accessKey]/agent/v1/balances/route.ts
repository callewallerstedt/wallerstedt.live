import { accountBalances, DEFAULT_AGENT_BALANCE_ACCOUNTS } from "@/lib/accounting/agent-api";
import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { privateJson, route } from "@/lib/accounting/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

function requestedAccounts(request: Request) {
  const raw = new URL(request.url).searchParams.get("accounts");
  if (!raw) return [...DEFAULT_AGENT_BALANCE_ACCOUNTS];
  const values = [...new Set(raw.split(",").map((value) => Number(value.trim())))];
  if (
    values.length === 0
    || values.length > 20
    || values.some((value) => !Number.isInteger(value) || value < 1000 || value > 9999)
  ) {
    throw new AccountingError("accounts must contain 1-20 comma-separated BAS account numbers.", 400, "invalid_accounts");
  }
  return values;
}

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({ ok: true, ...(await accountBalances(requestedAccounts(request))) });
  });
}
