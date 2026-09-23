import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseOptionalJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { beginBankConnection, disconnectBank, getConnectionState, listBanks, psuFromRequest } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

/** Connection status, plus ?banks=1 for the list of banks that can be linked. */
export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const search = new URL(request.url).searchParams;
    const state = await getConnectionState();
    const banks = search.get("banks") ? await listBanks(search.get("country") ?? "SE") : undefined;
    return privateJson({ ok: true, ...state, ...(banks ? { available: banks } : {}) });
  });
}

const connectSchema = z.object({
  bank: z.string().min(1).max(120).optional(),
  country: z.string().length(2).optional(),
});

/** Start BankID. Open the returned url in the owner's browser. */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(connectSchema, await parseOptionalJson(request, 2_000));
    const result = await beginBankConnection({
      aspspName: input.bank,
      aspspCountry: input.country,
      psu: psuFromRequest(request),
    });
    return privateJson({ ok: true, ...result });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(z.object({ sessionId: z.string().min(1) }), await parseOptionalJson(request, 2_000));
    await disconnectBank(input.sessionId);
    return privateJson({ ok: true });
  });
}
