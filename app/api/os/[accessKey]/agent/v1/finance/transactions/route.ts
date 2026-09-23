import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { listTransactions } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const search = new URL(request.url).searchParams;
    const number = (name: string) => {
      const value = Number(search.get(name));
      return Number.isFinite(value) && value > 0 ? value : undefined;
    };
    const result = await listTransactions({
      month: search.get("month") ?? undefined,
      from: search.get("from") ?? undefined,
      to: search.get("to") ?? undefined,
      category: search.get("category") ?? undefined,
      accountId: search.get("account") ?? undefined,
      q: search.get("q") ?? undefined,
      limit: number("limit"),
      offset: number("offset"),
    });
    return privateJson({ ok: true, ...result });
  });
}
