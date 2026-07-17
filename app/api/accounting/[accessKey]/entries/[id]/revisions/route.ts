import { requireOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { listEntryRevisions } from "@/lib/accounting/service";
import { parseUuid } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ ok: true, revisions: await listEntryRevisions(parseUuid(id)) });
  });
}
