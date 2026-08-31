import { createIdempotentAgentEntry } from "@/lib/accounting/agent-api";
import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { listEntries } from "@/lib/accounting/service";
import {
  agentEntryCreateSchema,
  normalizeEntryInput,
  parseWithSchema,
} from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({ ok: true, ...(await listEntries(new URL(request.url).searchParams)) });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const { bankText, ...rawInput } = parseWithSchema(
      agentEntryCreateSchema,
      await parseJson(request),
    );
    const input = normalizeEntryInput(rawInput);
    if (input.source === undefined || input.source === null || !input.source.trim()) {
      input.source = bankText;
    }
    const result = await createIdempotentAgentEntry(input, {
      bankText,
      date: rawInput.date,
      amount: rawInput.amount,
    });
    return privateJson({ ok: true, ...result }, result.created ? 201 : 200);
  });
}
