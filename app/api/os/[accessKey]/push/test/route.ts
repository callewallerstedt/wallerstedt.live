import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { privateJson, route } from "@/lib/accounting/http";
import { buildRecordNudgeNotification } from "@/lib/os/record-nudge";
import { isWebPushConfigured, sendWebPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    if (!isWebPushConfigured()) {
      throw new AccountingError("Notifications are not configured.", 503, "push_not_configured");
    }
    const notification = buildRecordNudgeNotification(accessKey);
    const result = await sendWebPush(notification);
    return privateJson({
      ok: true,
      title: notification.title,
      body: notification.body,
      sent: result.sent,
      failed: result.failed,
    });
  });
}
