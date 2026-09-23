import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { setTransactionCategory } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

const schema = z.object({
  category: z.string().min(1).max(40).optional(),
  note: z.string().max(1000).optional(),
  applyToMerchant: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(schema, await parseJson(request, 10_000));
    return privateJson({ ok: true, ...(await setTransactionCategory({ id: decodeURIComponent(id), ...input })) });
  });
}
