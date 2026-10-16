import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { resolveTeslaVin, teslaVehicleData } from "@/lib/tesla-agent";
import { summarizeVehicleData } from "@/lib/tesla-fleet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; vin: string }> };

/** Live vehicle data from Tesla (metric summary; ?raw=1 adds Tesla's full payload). */
export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, vin: vinParam } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const vin = await resolveTeslaVin(vinParam);
    const data = await teslaVehicleData(vin);
    const raw = new URL(request.url).searchParams.get("raw") === "1";
    return privateJson({
      ok: true,
      vehicle: summarizeVehicleData(data),
      ...(raw ? { raw: data } : {}),
    });
  });
}
