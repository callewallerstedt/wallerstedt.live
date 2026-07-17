import { requireOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { serializeAccount } from "@/lib/accounting/serialize";
import { createAccount, listAccounts } from "@/lib/accounting/service";
import { accountCreateSchema, parseWithSchema } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ ok: true, accounts: await listAccounts() });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const input = parseWithSchema(accountCreateSchema, await parseJson(request));
    const account = await createAccount(input);
    return privateJson({ ok: true, account: serializeAccount(account) }, 201);
  });
}
