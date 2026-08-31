import { currentAgentEntry, updateAgentEntry } from "@/lib/accounting/agent-api";
import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import {
  agentEntryPatchSchema,
  normalizeEntryInput,
  parseUuid,
  parseWithSchema,
} from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id: rawId } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({ ok: true, entry: await currentAgentEntry(parseUuid(rawId)) });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id: rawId } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const id = parseUuid(rawId);
    const { bankText, version, ...rawInput } = parseWithSchema(
      agentEntryPatchSchema,
      await parseJson(request),
    );
    const input = normalizeEntryInput(rawInput);
    let bankRow: { bankText: string; date: string; amount: string } | undefined;
    if (bankText) {
      const current = await currentAgentEntry(id);
      const date = rawInput.date ?? current.date;
      const amount = rawInput.amount ?? current.amount;
      if (!date || amount == null) {
        throw new AccountingError(
          "A dated amount is required to calculate idempotency.",
          400,
          "idempotency_fields_required",
        );
      }
      bankRow = { bankText, date, amount: String(amount) };
      if (input.source === undefined) input.source = bankText;
    }
    const entry = await updateAgentEntry(id, version, input, bankRow);
    return privateJson({ ok: true, entry });
  });
}
