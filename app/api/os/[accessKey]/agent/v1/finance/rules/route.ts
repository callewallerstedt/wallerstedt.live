import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { deleteRule, listRules } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const rules = await listRules();
    return privateJson({
      ok: true,
      rules: rules.map((rule) => ({ merchant: rule.merchant, category: rule.category })),
    });
  });
}

/** DELETE ?merchant=ICA — forget a rule; its rows go back to automatic sorting. */
export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const merchant = new URL(request.url).searchParams.get("merchant") ?? "";
    if (merchant) await deleteRule(merchant);
    return privateJson({ ok: true });
  });
}
