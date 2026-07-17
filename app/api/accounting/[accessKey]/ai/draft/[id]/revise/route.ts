import { reviseAiDraft } from "@/lib/accounting/ai";
import { requireOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseUuid } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey, true);
    const draft = await reviseAiDraft(
      parseUuid(id),
      await parseJson(request, 1_000_000),
    );
    return privateJson({ ok: true, draft });
  });
}
