import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { FINANCE_CATEGORIES } from "@/lib/finance/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({
      ok: true,
      categories: FINANCE_CATEGORIES.map(({ id, label, emoji, income, neutral }) => ({
        id,
        label,
        emoji,
        kind: income ? "income" : neutral ? "neutral" : "spending",
      })),
    });
  });
}
