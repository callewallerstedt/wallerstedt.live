import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { listBudgets, setBudgets } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const amount = z.number().min(0).max(10_000_000).nullable();

/**
 * Either { budgets: { fastfood: 1000, car: 2500 } } in whole kronor, or
 * { budgets: [{ category, monthlySek }] }. 0 or null removes a budget.
 */
const schema = z.object({
  budgets: z.union([
    z.record(z.string(), amount),
    z.array(z.object({ category: z.string(), monthlySek: amount })),
  ]),
});

function view(rows: Awaited<ReturnType<typeof listBudgets>>) {
  return rows.map((row) => ({ ...row, monthlySek: row.monthlyCents / 100 }));
}

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({ ok: true, budgets: view(await listBudgets()) });
  });
}

export async function PUT(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(schema, await parseJson(request, 20_000));
    const entries = Array.isArray(input.budgets)
      ? input.budgets.map((row) => ({ category: row.category, monthlySek: row.monthlySek }))
      : Object.entries(input.budgets).map(([category, monthlySek]) => ({ category, monthlySek }));
    const saved = await setBudgets(
      entries.map((row) => ({
        category: row.category,
        monthlyCents: row.monthlySek == null ? null : Math.round(row.monthlySek * 100),
      })),
    );
    return privateJson({ ok: true, budgets: view(saved) });
  });
}

export const PATCH = PUT;
