import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { resolveTeslaVin, sendTeslaCommand } from "@/lib/tesla-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; vin: string }> };

const schema = z.object({
  command: z.string().min(2).max(64),
  params: z.record(z.string(), z.unknown()).optional(),
});

/** Send one allowlisted vehicle command, e.g. { "command": "set_temps", "params": { "driver_temp": 21, "passenger_temp": 21 } }. */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, vin: vinParam } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const body = parseWithSchema(schema, await parseJson(request, 8_000));
    const vin = await resolveTeslaVin(vinParam);
    const result = await sendTeslaCommand(vin, body.command, body.params ?? {});
    return privateJson({ ok: result.result, ...result });
  });
}
