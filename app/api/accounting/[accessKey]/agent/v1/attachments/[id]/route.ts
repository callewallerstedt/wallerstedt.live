import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { assignDocument, softDeleteDocument } from "@/lib/accounting/service";
import { serializeDocument } from "@/lib/accounting/serialize";
import { documentAssignSchema, versionSchema, parseUuid, parseWithSchema } from "@/lib/accounting/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ accessKey: string; id: string }> };
export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(documentAssignSchema, await parseJson(request));
    return privateJson({ ok: true, document: serializeDocument(await assignDocument(parseUuid(id), input.entryId, input.version, "agent-api")) });
  });
}
export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const { version } = parseWithSchema(versionSchema, await parseJson(request));
    return privateJson({ ok: true, document: serializeDocument(await softDeleteDocument(parseUuid(id), version, "agent-api")) });
  });
}
