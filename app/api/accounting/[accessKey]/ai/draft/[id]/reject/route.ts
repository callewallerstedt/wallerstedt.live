import { rejectAiDraft } from "@/lib/accounting/ai";
import { requireOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { parseUuid } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey, true);
    return privateJson({ ok: true, draft: await rejectAiDraft(parseUuid(id)) });
  });
}
