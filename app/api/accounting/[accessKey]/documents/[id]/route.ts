import { requireOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { serializeDocument } from "@/lib/accounting/serialize";
import { softDeleteDocument } from "@/lib/accounting/service";
import { parseUuid, parseWithSchema, versionSchema } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey, true);
    const { version } = parseWithSchema(versionSchema, await parseJson(request, 16_000));
    const document = await softDeleteDocument(parseUuid(id), version);
    return privateJson({ ok: true, document: serializeDocument(document) });
  });
}
