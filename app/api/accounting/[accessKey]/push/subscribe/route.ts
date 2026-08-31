import { requireOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { AccountingError } from "@/lib/accounting/errors";
import {
  deletePushSubscription,
  isWebPushConfigured,
  parsePushSubscription,
  savePushSubscription,
} from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

function assertPushConfigured() {
  if (!isWebPushConfigured()) {
    throw new AccountingError("Notifications are not configured.", 503, "push_not_configured");
  }
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    assertPushConfigured();
    const subscription = parsePushSubscription(await parseJson(request));
    if (!subscription) {
      throw new AccountingError("Invalid subscription.", 400, "invalid_subscription");
    }
    await savePushSubscription(subscription);
    return privateJson({ ok: true });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    assertPushConfigured();
    const body = await parseJson(request);
    const endpoint =
      body && typeof body === "object" && "endpoint" in body && typeof body.endpoint === "string"
        ? body.endpoint.trim()
        : "";
    if (!endpoint) {
      throw new AccountingError("Invalid subscription.", 400, "invalid_subscription");
    }
    await deletePushSubscription(endpoint);
    return privateJson({ ok: true });
  });
}
