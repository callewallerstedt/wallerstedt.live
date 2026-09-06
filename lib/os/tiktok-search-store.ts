import { getAccountingDb } from "@/lib/accounting/db";
import { AccountingError } from "@/lib/accounting/errors";

import {
  parseSavedTikTokSearch,
  savedTikTokSearchPayload,
  type TikTokSearchResult,
} from "./tiktok-search";

function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "42P01";
}

function searchUnavailable() {
  return new AccountingError(
    "TikTok search cache needs a database migration.",
    503,
    "tiktok_search_unavailable",
  );
}

export type SavedTikTokSearch = {
  taskId: string;
  query: string;
  results: TikTokSearchResult[];
  searchedAt: string;
};

export async function listTikTokSearchTimes(
  taskIds: string[],
): Promise<Map<string, string>> {
  const times = new Map<string, string>();
  if (!taskIds.length) return times;
  try {
    const rows = await getAccountingDb().companyTikTokSearch.findMany({
      where: { taskId: { in: taskIds } },
      select: { taskId: true, updatedAt: true },
    });
    for (const row of rows) times.set(row.taskId, row.updatedAt.toISOString());
    return times;
  } catch (error) {
    if (isMissingTable(error)) return times;
    throw error;
  }
}

export async function getSavedTikTokSearch(taskId: string): Promise<SavedTikTokSearch | null> {
  try {
    const row = await getAccountingDb().companyTikTokSearch.findUnique({
      where: { taskId },
    });
    if (!row) return null;
    return {
      taskId: row.taskId,
      query: row.query,
      results: parseSavedTikTokSearch(row.payload),
      searchedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

export async function saveTikTokSearch(
  taskId: string,
  query: string,
  results: TikTokSearchResult[],
): Promise<SavedTikTokSearch> {
  const db = getAccountingDb();
  const task = await db.companyTask.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) {
    throw new AccountingError("That video idea was not found.", 404, "not_found");
  }
  try {
    const row = await db.companyTikTokSearch.upsert({
      where: { taskId },
      create: {
        taskId,
        query,
        payload: savedTikTokSearchPayload(results),
      },
      update: {
        query,
        payload: savedTikTokSearchPayload(results),
      },
    });
    return {
      taskId: row.taskId,
      query: row.query,
      results,
      searchedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    if (isMissingTable(error)) throw searchUnavailable();
    throw error;
  }
}
