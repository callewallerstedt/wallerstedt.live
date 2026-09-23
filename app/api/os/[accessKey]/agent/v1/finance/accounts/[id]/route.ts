import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { updateAccount } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

const schema = z.object({
  displayName: z.string().max(80).optional(),
  hidden: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(schema, await parseJson(request, 5_000));
    return privateJson({ ok: true, account: await updateAccount(decodeURIComponent(id), input) });
  });
}
