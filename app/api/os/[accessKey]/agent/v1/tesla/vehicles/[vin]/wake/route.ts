import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { resolveTeslaVin, wakeTeslaVehicle } from "@/lib/tesla-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; vin: string }> };

/** Ask the car to wake up. It usually reports "online" 10-30 seconds later. */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, vin: vinParam } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const vin = await resolveTeslaVin(vinParam);
    return privateJson({ ok: true, ...(await wakeTeslaVehicle(vin)) });
  });
}
