import { z } from "zod";

import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import {
  parseTregTikTokSearch,
  TIKTOK_SEARCH_DEFAULT_LIMIT,
  TIKTOK_SEARCH_MAX_LIMIT,
} from "@/lib/os/tiktok-search";
import { getSavedTikTokSearch, saveTikTokSearch } from "@/lib/os/tiktok-search-store";
import { fetchTregTikTokSearch } from "@/lib/os/tiktok-treg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(TIKTOK_SEARCH_MAX_LIMIT).optional(),
  taskId: z.string().uuid().optional(),
  refresh: z.boolean().optional(),
});

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    const taskId = new URL(request.url).searchParams.get("taskId")?.trim() ?? "";
    if (!z.string().uuid().safeParse(taskId).success) {
      throw new AccountingError("Could not load that saved TikTok search.", 400, "validation_error");
    }
    const saved = await getSavedTikTokSearch(taskId);
    if (!saved) {
      return privateJson({ ok: true, cached: false, taskId, results: [] });
    }
    return privateJson({
      ok: true,
      cached: true,
      taskId: saved.taskId,
      query: saved.query,
      results: saved.results,
      searchedAt: saved.searchedAt,
    });
  });
}

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
    const taskId = parsed.data.taskId;
    const refresh = parsed.data.refresh === true;

    if (taskId && !refresh) {
      const saved = await getSavedTikTokSearch(taskId);
      if (saved) {
        return privateJson({
          ok: true,
          cached: true,
          taskId: saved.taskId,
          query: saved.query,
          results: saved.results,
          searchedAt: saved.searchedAt,
        });
      }
    }

    const payload = await fetchTregTikTokSearch(query, limit);
    const results = parseTregTikTokSearch(payload);
    let searchedAt: string | null = null;
    if (taskId) {
      const saved = await saveTikTokSearch(taskId, query, results);
      searchedAt = saved.searchedAt;
    }

    return privateJson({
      ok: true,
      cached: false,
      query,
      results,
      taskId: taskId ?? null,
      searchedAt,
    });
  });
}
