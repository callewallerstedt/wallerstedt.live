import { requireOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { serializeEntry } from "@/lib/accounting/serialize";
import { deleteEntry, getEntry, updateEntry } from "@/lib/accounting/service";
import {
  entryPatchSchema,
  normalizeEntryInput,
  parseUuid,
  parseWithSchema,
  versionSchema,
} from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id: rawId } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ ok: true, entry: await getEntry(parseUuid(rawId)) });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id: rawId } = await params;
    await requireOwnerSession(request, accessKey, true);
    const { version, ...rawInput } = parseWithSchema(entryPatchSchema, await parseJson(request));
    const entry = await updateEntry(
      parseUuid(rawId),
      version,
      normalizeEntryInput(rawInput),
    );
    return privateJson({ ok: true, entry: serializeEntry(entry) });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id: rawId } = await params;
    await requireOwnerSession(request, accessKey, true);
    const { version } = parseWithSchema(versionSchema, await parseJson(request, 16_000));
    const entry = await deleteEntry(parseUuid(rawId), version);
    return privateJson({ ok: true, entry: serializeEntry(entry) });
  });
}
