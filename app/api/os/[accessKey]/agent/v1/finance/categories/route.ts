import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { FINANCE_CATEGORIES } from "@/lib/finance/categories";
import { createCustomCategory, deleteCustomCategory, listCustomCategories, updateCustomCategory } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

function view() {
  return FINANCE_CATEGORIES.map(({ id, label, emoji, income, neutral, custom }) => ({
    id,
    label,
    emoji,
    kind: income ? "income" : neutral ? "neutral" : "spending",
    custom: Boolean(custom),
  }));
}

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    await listCustomCategories();
    return privateJson({ ok: true, categories: view() });
  });
}

const kind = z.enum(["spending", "neutral", "income"]);

/** { "label": "Presenter", "emoji": "🎁", "kind": "spending" } — neutral never counts as spending. */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(
      z.object({ label: z.string().min(1).max(40), emoji: z.string().max(8).optional(), kind: kind.optional() }),
      await parseJson(request, 2_000),
    );
    const category = await createCustomCategory(input);
    return privateJson({ ok: true, category, categories: view() });
  });
}

/** PATCH { id, label?, emoji?, kind? } */
export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(
      z.object({ id: z.string().min(1), label: z.string().max(40).optional(), emoji: z.string().max(8).optional(), kind: kind.optional() }),
      await parseJson(request, 2_000),
    );
    const category = await updateCustomCategory(input.id, input);
    return privateJson({ ok: true, category });
  });
}

/** DELETE ?id=c-presenter — its transactions go back to automatic sorting. */
export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    await deleteCustomCategory(new URL(request.url).searchParams.get("id") ?? "");
    return privateJson({ ok: true });
  });
}
