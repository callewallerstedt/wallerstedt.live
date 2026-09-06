import { z } from "zod";

import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
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
    await requireOwnerSession(request, accessKey);
    const [accounts, lastScan] = await Promise.all([listWatchAccounts(), latestWatchScan()]);
    return privateJson({ ok: true, accounts, lastScan });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const parsed = addSchema.safeParse(await parseJson(request, 4_000));
    if (!parsed.success) {
      throw new AccountingError("Could not add that account.", 400, "validation_error");
    }
    const accounts = await addWatchAccount(parsed.data.handle);
    return privateJson({ ok: true, accounts }, 201);
  });
}
