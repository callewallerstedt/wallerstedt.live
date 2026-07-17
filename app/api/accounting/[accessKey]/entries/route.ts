import { requireOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { serializeEntry } from "@/lib/accounting/serialize";
import { createEntry, listEntries } from "@/lib/accounting/service";
import {
  entryCreateSchema,
  normalizeEntryInput,
  parseWithSchema,
} from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ ok: true, ...(await listEntries(new URL(request.url).searchParams)) });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const input = normalizeEntryInput(
      parseWithSchema(entryCreateSchema, await parseJson(request)),
    );
    const entry = await createEntry(input);
    return privateJson({ ok: true, entry: serializeEntry(entry) }, 201);
  });
}
