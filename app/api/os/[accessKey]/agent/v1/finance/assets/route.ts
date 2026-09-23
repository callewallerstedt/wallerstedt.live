import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { assetInput, assetSchema } from "@/lib/finance/asset-input";
import { listAssets, upsertAsset } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({ ok: true, assets: await listAssets() });
  });
}

/** Add a manually tracked holding, e.g. { "name": "Avanza ISK", "valueSek": 84500 }. */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(assetSchema.extend({ name: z.string().min(1).max(80) }), await parseJson(request, 5_000));
    return privateJson({ ok: true, asset: await upsertAsset(assetInput(input)) });
  });
}
