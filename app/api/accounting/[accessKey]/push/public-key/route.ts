import { requireOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    if (!isWebPushConfigured()) {
      return privateJson({ ok: true, configured: false, publicKey: "" });
    }
    return privateJson({
      ok: true,
      configured: true,
      publicKey: getVapidPublicKey(),
    });
  });
}
