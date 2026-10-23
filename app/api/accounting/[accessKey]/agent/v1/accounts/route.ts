import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { listAccounts, createAccount } from "@/lib/accounting/service";
import { serializeAccount } from "@/lib/accounting/serialize";
import { accountCreateSchema, parseWithSchema } from "@/lib/accounting/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ accessKey: string }> };
export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    await requireAgentOrOwnerSession(request, (await params).accessKey);
    return privateJson({ ok: true, accounts: await listAccounts() });
  });
}
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    await requireAgentOrOwnerSession(request, (await params).accessKey, true);
    return privateJson({ ok: true, account: serializeAccount(await createAccount(parseWithSchema(accountCreateSchema, await parseJson(request)), "agent-api")) }, 201);
  });
}
