import { currentAgentEntry, updateAgentEntry } from "@/lib/accounting/agent-api";
import type { BankRow } from "@/lib/accounting/agent-api";
import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { deleteEntry } from "@/lib/accounting/service";
import { serializeEntry } from "@/lib/accounting/serialize";
import {
  agentEntryPatchSchema,
  normalizeEntryInput,
  parseUuid,
  parseWithSchema,
  versionSchema,
} from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const { version } = parseWithSchema(versionSchema, await parseJson(request));
    return privateJson({ ok: true, entry: serializeEntry(await deleteEntry(parseUuid(id), version, "agent-api")) });
  });
}

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
    const { bankText, bankAccountId, bankTransactionId, version, ...rawInput } = parseWithSchema(
      agentEntryPatchSchema,
      await parseJson(request),
    );
    const input = normalizeEntryInput(rawInput);
    let bankRow: BankRow | undefined;
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
      bankRow = { bankText, date, amount: String(amount), bankAccountId, bankTransactionId };
      if (input.source === undefined) input.source = bankText;
    }
    const entry = await updateAgentEntry(id, version, input, bankRow);
    return privateJson({ ok: true, entry });
  });
}
