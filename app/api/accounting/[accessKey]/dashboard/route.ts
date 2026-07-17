import { requireOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { dashboard } from "@/lib/accounting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ ok: true, ...(await dashboard()) });
  });
}
