import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { importStatement } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ accessKey: string }> };

const schema = z.object({
  accountNumber: z.string().min(6).max(40),
  accountName: z.string().max(120).optional(),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        text: z.string().max(500),
        amountCents: z.number().int().min(-10_000_000_000).max(10_000_000_000),
      }),
    )
    .max(20_000),
});

/** Older history from a Handelsbanken Excel export (parsed in the browser). */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(schema, await parseJson(request, 4_000_000));
    return privateJson({ ok: true, ...(await importStatement(input)) });
  });
}
