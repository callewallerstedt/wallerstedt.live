import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { addWatchAccount, latestWatchScan, listWatchAccounts } from "@/lib/os/tiktok-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const addSchema = z.object({
  handle: z.string().trim().min(1).max(80),
});

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const [accounts, lastScan] = await Promise.all([listWatchAccounts(), latestWatchScan()]);
    return privateJson({ ok: true, count: accounts.length, accounts, lastScan });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(addSchema, await parseJson(request, 4_000));
    const accounts = await addWatchAccount(input.handle);
    return privateJson({ ok: true, accounts }, 201);
  });
}
