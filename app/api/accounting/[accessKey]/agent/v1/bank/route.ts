import { z } from "zod";
import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { bankConnectSchema, beginBusinessBankConnection, businessBanks, businessBankState, disconnectBusinessBank } from "@/lib/accounting/bank";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ accessKey: string }> };
export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    await requireAgentOrOwnerSession(request, (await params).accessKey);
    const state = await businessBankState();
    return privateJson({ ok: true, ...state, ...(new URL(request.url).searchParams.get("banks") === "true" ? { available: await businessBanks() } : {}) });
  });
}
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const actor = await requireAgentOrOwnerSession(request, (await params).accessKey, true);
    const input = parseWithSchema(bankConnectSchema, await parseJson(request));
    // A bot's server IP must not be represented as an owner-present bank request.
    const psu = actor.kind === "owner" ? { ip: request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim(), userAgent: request.headers.get("user-agent") ?? undefined } : undefined;
    return privateJson({ ok: true, ...await beginBusinessBankConnection(input, psu) });
  });
}
export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    await requireAgentOrOwnerSession(request, (await params).accessKey, true);
    const input = parseWithSchema(z.object({ connectionId: z.string().min(1).max(200) }), await parseJson(request));
    await disconnectBusinessBank(input.connectionId);
    return privateJson({ ok: true });
  });
}
