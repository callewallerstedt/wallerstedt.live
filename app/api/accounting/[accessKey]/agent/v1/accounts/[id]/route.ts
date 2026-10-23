import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { updateAccount, deleteAccount } from "@/lib/accounting/service";
import { serializeAccount } from "@/lib/accounting/serialize";
import { accountPatchSchema, versionSchema, parseUuid, parseWithSchema } from "@/lib/accounting/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ accessKey: string; id: string }> };
export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const { version, ...input } = parseWithSchema(accountPatchSchema, await parseJson(request));
    return privateJson({ ok: true, account: serializeAccount(await updateAccount(parseUuid(id), version, input, "agent-api")) });
  });
}
export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const { version } = parseWithSchema(versionSchema, await parseJson(request));
    return privateJson({ ok: true, account: serializeAccount(await deleteAccount(parseUuid(id), version, "agent-api")) });
  });
}
