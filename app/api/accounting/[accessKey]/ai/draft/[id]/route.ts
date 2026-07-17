import { getAiDraft, purgeRejectedAiDraftDocuments } from "@/lib/accounting/ai";
import { requireOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { parseUuid } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ ok: true, draft: await getAiDraft(parseUuid(id)) });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey, true);
    return privateJson({
      ok: true,
      cleanup: await purgeRejectedAiDraftDocuments(parseUuid(id)),
    });
  });
}
