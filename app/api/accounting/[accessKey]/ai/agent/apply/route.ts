import { applyAccountingAgentProposal } from "@/lib/accounting/agent";
import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ accessKey: string }> };

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const body = await parseJson(request, 1_500_000);
    const token = body && typeof body === "object"
      ? (body as Record<string, unknown>).token
      : null;
    if (typeof token !== "string" || token.length < 20 || token.length > 1_400_000) {
      throw new AccountingError(
        "Invalid AI approval.",
        400,
        "invalid_agent_proposal",
      );
    }
    return privateJson({
      ok: true,
      result: await applyAccountingAgentProposal(token),
    });
  });
}
