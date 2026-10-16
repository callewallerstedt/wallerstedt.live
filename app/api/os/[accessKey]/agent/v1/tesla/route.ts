import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { prisma } from "@/lib/prisma";
import { publicLiveState } from "@/lib/tesla-live";
import {
  disconnectTeslaAgent,
  listTeslaVehicles,
  teslaAgentCommandPolicy,
  teslaAgentConnection,
} from "@/lib/tesla-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

/**
 * Connection status, the account's vehicles (listing never wakes the car) and
 * the latest Fleet Telemetry snapshot from the home bridge, if any.
 */
export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const connection = await teslaAgentConnection();
    const vehicles = connection.connected ? await listTeslaVehicles() : [];
    const live = prisma
      ? await prisma.teslaLiveState.findFirst({ orderBy: { updatedAt: "desc" } }).catch(() => null)
      : null;
    const policy = teslaAgentCommandPolicy();
    return privateJson({
      ok: true,
      ...connection,
      vehicles,
      telemetry: live ? publicLiveState(live) : null,
      commands: { allowed: policy.allowed, signedProxy: policy.signedProxy },
    });
  });
}

/** Forget the stored Tesla login. Reconnect with /api/i/<secret>/auth?for=agents. */
export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    await disconnectTeslaAgent();
    return privateJson({ ok: true, connected: false });
  });
}
