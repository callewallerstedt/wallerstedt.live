import { z } from "zod";

import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { scheduleWatchScanBurst } from "@/lib/os/tiktok-scan-schedule";
import { authorizeWatchScanContinue } from "@/lib/os/tiktok-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const continueSchema = z.object({
  scanId: z.string().uuid(),
  token: z.string().trim().min(16).max(128),
});

export async function POST(request: Request) {
  return route(async () => {
    const input = parseWithSchema(continueSchema, await parseJson(request, 2_000));
    const auth = await authorizeWatchScanContinue(input.scanId, input.token);
    if (auth.open) {
      scheduleWatchScanBurst(request, auth.scanId, auth.token);
    }
    return privateJson({
      ok: true,
      status: auth.open ? "running" : "done",
      scanId: auth.scanId,
    });
  });
}
