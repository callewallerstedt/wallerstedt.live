import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { watchScanListFields } from "@/lib/os/tiktok-scan-route";
import { listWatchScans } from "@/lib/os/tiktok-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const [scans, scanFields] = await Promise.all([
      listWatchScans(),
      watchScanListFields(request),
    ]);
    return privateJson({
      ok: true,
      count: scans.length,
      lastScan: scanFields.lastScan,
      scan: scanFields.scan,
      scans,
    });
  });
}
