import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { assetInput, assetSchema } from "@/lib/finance/asset-input";
import { deleteAsset, upsertAsset } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

/** Update a holding, typically just { "valueSek": 91200 }. */
export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(assetSchema, await parseJson(request, 5_000));
    return privateJson({ ok: true, asset: await upsertAsset({ id: decodeURIComponent(id), ...assetInput(input) }) });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    await deleteAsset(decodeURIComponent(id));
    return privateJson({ ok: true });
  });
}
