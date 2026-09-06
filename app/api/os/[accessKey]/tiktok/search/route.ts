import { z } from "zod";

import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import {
  parseTregTikTokSearch,
  TIKTOK_SEARCH_DEFAULT_LIMIT,
  TIKTOK_SEARCH_MAX_LIMIT,
} from "@/lib/os/tiktok-search";
import { fetchTregTikTokSearch } from "@/lib/os/tiktok-treg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z
    .number()
    .int()
    .min(1)
    .max(TIKTOK_SEARCH_MAX_LIMIT)
    .optional(),
});

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const parsed = searchSchema.safeParse(await parseJson(request, 8_000));
    if (!parsed.success) {
      throw new AccountingError("Could not run that TikTok search.", 400, "validation_error", {
        fields: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }

    const query = parsed.data.q;
    const limit = parsed.data.limit ?? TIKTOK_SEARCH_DEFAULT_LIMIT;
    const payload = await fetchTregTikTokSearch(query, limit);
    return privateJson({
      ok: true,
      query,
      results: parseTregTikTokSearch(payload),
    });
  });
}
