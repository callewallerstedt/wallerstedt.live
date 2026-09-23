import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { listFixedCosts, saveFixedCosts } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const view = (list: Awaited<ReturnType<typeof listFixedCosts>>) =>
  list.map((row) => ({ ...row, amountSek: row.amountCents / 100 }));

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({ ok: true, fixedCosts: view(await listFixedCosts()) });
  });
}

/**
 * Replace the whole list:
 * { "fixedCosts": [{ "name": "Bil", "amountSek": 3600, "category": "car", "match": "WALLERSTEDT L", "day": 25 }] }
 */
export async function PUT(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(
      z.object({
        fixedCosts: z
          .array(
            z.object({
              id: z.string().max(60).optional(),
              name: z.string().min(1).max(60),
              amountSek: z.number().min(0).max(10_000_000),
              category: z.string().max(40).optional(),
              match: z.string().max(60).optional(),
              day: z.number().int().min(1).max(31).nullable().optional(),
            }),
          )
          .max(60),
      }),
      await parseJson(request, 50_000),
    );
    const saved = await saveFixedCosts(
      input.fixedCosts.map((row) => ({ ...row, amountCents: Math.round(row.amountSek * 100), day: row.day ?? null })),
    );
    return privateJson({ ok: true, fixedCosts: view(saved) });
  });
}
