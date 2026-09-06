import { z } from "zod";

import { parseOptionalJson, privateJson } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { isOpenScanStatus } from "./tiktok-scan";
import { scheduleWatchScanContinue } from "./tiktok-scan-schedule";
import {
  publicWatchScanPost,
  readWatchScanView,
  requestWatchScan,
} from "./tiktok-watch";

export const watchScanBodySchema = z.object({
  handle: z.string().trim().min(1).max(80).optional(),
  accountId: z.string().trim().min(1).max(80).optional(),
  scanId: z.string().uuid().optional(),
});

export async function handleWatchScanPost(request: Request) {
  const input = parseWithSchema(watchScanBodySchema, await parseOptionalJson(request, 4_000));
  const result = await requestWatchScan(input);
  if (result.continueToken && isOpenScanStatus(result.status)) {
    scheduleWatchScanContinue(request, result.scanId, result.continueToken);
  }
  return privateJson(publicWatchScanPost(result));
}

export async function watchScanListFields(request: Request) {
  const view = await readWatchScanView();
  if (view.openScanId && view.continueToken) {
    scheduleWatchScanContinue(request, view.openScanId, view.continueToken);
  }
  return {
    lastScan: view.lastScan,
    scan: view.scan,
  };
}
