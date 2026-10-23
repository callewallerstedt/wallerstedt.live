import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { listEntryRevisions } from "@/lib/accounting/service";
import { parseUuid } from "@/lib/accounting/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ accessKey: string; id: string }> }) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({ ok: true, revisions: await listEntryRevisions(parseUuid(id)) });
  });
}
