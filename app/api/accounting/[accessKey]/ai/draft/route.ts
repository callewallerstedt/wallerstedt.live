import { createAiDraft, listAiDrafts } from "@/lib/accounting/ai";
import { requireOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ ok: true, drafts: await listAiDrafts() });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    return privateJson({ ok: true, draft: await createAiDraft(request) }, 201);
  });
}
