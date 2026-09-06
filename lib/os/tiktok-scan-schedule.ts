import { after } from "next/server";

import { redactedErrorDiagnostic } from "@/lib/accounting/errors";
import { getSiteOrigin } from "@/lib/push";
import { isOpenScanStatus } from "./tiktok-scan";
import { processWatchScanBurst, type TikTokScanPostResult } from "./tiktok-watch";

export const TIKTOK_SCAN_CONTINUE_PATH = "/api/os/tiktok-watch-scan-continue";

export function tiktokScanContinueUrl(request: Request) {
  try {
    return new URL(TIKTOK_SCAN_CONTINUE_PATH, request.url).toString();
  } catch {
    return `${getSiteOrigin()}${TIKTOK_SCAN_CONTINUE_PATH}`;
  }
}

async function fetchScanContinue(request: Request, scanId: string, token: string) {
  await fetch(tiktokScanContinueUrl(request), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scanId, token }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export async function chainWatchScanContinue(request: Request, scanId: string, token: string) {
  try {
    await fetchScanContinue(request, scanId, token);
  } catch (error) {
    console.error("tiktok watch scan chain failed", redactedErrorDiagnostic(error));
  }
}

/** Process one account (or trending) after the response, then hop to a new invocation. */
export function scheduleWatchScanBurst(request: Request, scanId: string, token: string) {
  if (!scanId || !token) return;
  after(async () => {
    try {
      const result = await processWatchScanBurst(scanId, { token });
      if (result?.advanced && isOpenScanStatus(result.status) && result.continueToken) {
        await fetchScanContinue(request, result.scanId, result.continueToken);
      }
    } catch (error) {
      console.error("tiktok watch scan burst failed", redactedErrorDiagnostic(error));
    }
  });
}

/** Enqueue the next burst on the dedicated continue route (no Treg work here). */
export function scheduleWatchScanContinue(request: Request, scanId: string, token: string) {
  if (!scanId || !token) return;
  after(async () => {
    await chainWatchScanContinue(request, scanId, token);
  });
}

export function scheduleOpenWatchScan(request: Request, result: Pick<TikTokScanPostResult, "scanId" | "status" | "continueToken">) {
  if (!result.continueToken || !isOpenScanStatus(result.status)) return;
  scheduleWatchScanContinue(request, result.scanId, result.continueToken);
}
