import { z } from "zod";
import { requireOwnerSession } from "@/lib/accounting/auth";
import { disconnectGmailAccount } from "@/lib/accounting/gmail";
import { privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey, true);
    const accountId = parseWithSchema(z.string().uuid(), id);
    return privateJson({
      ok: true,
      account: await disconnectGmailAccount(accountId),
    });
  });
}
