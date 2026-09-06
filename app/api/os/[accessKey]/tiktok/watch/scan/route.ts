import { requireOwnerSession } from "@/lib/accounting/auth";
import { route } from "@/lib/accounting/http";
import { handleWatchScanPost } from "@/lib/os/tiktok-scan-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ accessKey: string }> };

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    return handleWatchScanPost(request);
  });
}
