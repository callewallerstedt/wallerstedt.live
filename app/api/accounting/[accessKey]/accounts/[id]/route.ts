import { requireOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { serializeAccount } from "@/lib/accounting/serialize";
import { deleteAccount, updateAccount } from "@/lib/accounting/service";
import {
  accountPatchSchema,
  parseUuid,
  parseWithSchema,
  versionSchema,
} from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id: rawId } = await params;
    await requireOwnerSession(request, accessKey, true);
    const id = parseUuid(rawId);
    const { version, ...input } = parseWithSchema(accountPatchSchema, await parseJson(request));
    const account = await updateAccount(id, version, input);
    return privateJson({ ok: true, account: serializeAccount(account) });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id: rawId } = await params;
    await requireOwnerSession(request, accessKey, true);
    const id = parseUuid(rawId);
    const { version } = parseWithSchema(versionSchema, await parseJson(request, 16_000));
    const account = await deleteAccount(id, version);
    return privateJson({ ok: true, account: serializeAccount(account) });
  });
}
