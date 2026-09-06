import { getAccountingDb } from "@/lib/accounting/db";
import { AccountingError } from "@/lib/accounting/errors";

import {
  attachHandle,
  buildTikTokScanPayload,
  isTikTokHandle,
  normalizeTikTokHandle,
  PIANO_TRENDING_QUERY,
  TIKTOK_SCAN_TOP,
  TIKTOK_SEED_HANDLES,
  type TikTokScanAccountResult,
  type TikTokScanPayload,
  type TikTokScanVideo,
  type TikTokWatchAccount,
} from "./tiktok-scan";

export type { TikTokWatchAccount };
import { parseTregTikTokProfile, parseTregTikTokSearch, parseTregTikTokVideos } from "./tiktok-search";
import {
  fetchTregTikTokProfile,
  fetchTregTikTokSearch,
  fetchTregTikTokUserVideos,
} from "./tiktok-treg";

function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "42P01";
}

function watchUnavailable() {
  return new AccountingError(
    "TikTok watch lists need a database migration.",
    503,
    "tiktok_watch_unavailable",
  );
}

const ACCOUNT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toWatchAccount(row: {
  id: string;
  handle: string;
  uniqueId: string;
  nickname: string;
  sortOrder: number;
}): TikTokWatchAccount {
  return {
    id: row.id,
    handle: row.handle,
    uniqueId: row.uniqueId || row.handle,
    nickname: row.nickname,
    sortOrder: row.sortOrder,
  };
}

async function ensureSeedAccounts() {
  const db = getAccountingDb();
  const rows = await db.companyTikTokAccount.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const have = new Set(rows.map((row) => row.handle));
  const missing = TIKTOK_SEED_HANDLES.filter((handle) => !have.has(handle));
  if (!missing.length) return rows;
  const maxSort = rows.reduce((max, row) => Math.max(max, row.sortOrder), -1);
  await db.companyTikTokAccount.createMany({
    data: missing.map((handle, index) => ({
      handle,
      uniqueId: handle,
      sortOrder: maxSort + 1 + index,
    })),
  });
  return db.companyTikTokAccount.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function listWatchAccounts(): Promise<TikTokWatchAccount[]> {
  try {
    const rows = await ensureSeedAccounts();
    return rows.map(toWatchAccount);
  } catch (error) {
    if (isMissingTable(error)) throw watchUnavailable();
    throw error;
  }
}

export async function addWatchAccount(rawHandle: string): Promise<TikTokWatchAccount[]> {
  const handle = normalizeTikTokHandle(rawHandle);
  if (!isTikTokHandle(handle)) {
    throw new AccountingError("That does not look like a TikTok handle.", 400, "validation_error");
  }
  const current = await listWatchAccounts();
  if (current.some((account) => account.handle === handle)) return current;
  if (current.length >= 20) {
    throw new AccountingError("Twenty watched accounts is enough.", 400, "validation_error");
  }
  const db = getAccountingDb();
  try {
    await db.companyTikTokAccount.create({
      data: {
        handle,
        uniqueId: handle,
        sortOrder: current.reduce((max, account) => Math.max(max, account.sortOrder), -1) + 1,
      },
    });
  } catch (error) {
    if (isMissingTable(error)) throw watchUnavailable();
    throw error;
  }
  return listWatchAccounts();
}

export async function removeWatchAccount(idOrHandle: string): Promise<TikTokWatchAccount[]> {
  const db = getAccountingDb();
  const trimmed = idOrHandle.trim();
  const handle = normalizeTikTokHandle(trimmed);
  try {
    await db.companyTikTokAccount.deleteMany({
      where: ACCOUNT_ID_RE.test(trimmed) ? { id: trimmed } : { handle },
    });
  } catch (error) {
    if (isMissingTable(error)) throw watchUnavailable();
    throw error;
  }
  return listWatchAccounts();
}

export async function removeWatchAccountOrThrow(idOrHandle: string): Promise<TikTokWatchAccount[]> {
  const trimmed = idOrHandle.trim();
  const handle = normalizeTikTokHandle(trimmed);
  const current = await listWatchAccounts();
  const exists = current.some((account) =>
    ACCOUNT_ID_RE.test(trimmed) ? account.id === trimmed : account.handle === handle,
  );
  if (!exists) {
    throw new AccountingError("That watched account was not found.", 404, "not_found");
  }
  return removeWatchAccount(trimmed);
}

export async function latestWatchScan(): Promise<TikTokScanPayload | null> {
  const db = getAccountingDb();
  try {
    const row = await db.companyTikTokScan.findFirst({ orderBy: { scannedAt: "desc" } });
    if (!row) return null;
    return row.payload as TikTokScanPayload;
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

export async function listWatchScans(limit = 8): Promise<TikTokScanPayload[]> {
  const db = getAccountingDb();
  try {
    const take = Math.min(Math.max(1, Math.round(limit)), 8);
    const rows = await db.companyTikTokScan.findMany({
      orderBy: { scannedAt: "desc" },
      take,
    });
    return rows.map((row) => row.payload as TikTokScanPayload);
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

async function persistScan(payload: TikTokScanPayload) {
  const db = getAccountingDb();
  await db.companyTikTokScan.create({
    data: {
      scannedAt: new Date(payload.scannedAt),
      weekKey: payload.weekKey,
      payload,
    },
  });
  const stale = await db.companyTikTokScan.findMany({
    orderBy: { scannedAt: "desc" },
    skip: 8,
    select: { id: true },
  });
  if (stale.length) {
    await db.companyTikTokScan.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }
}

async function scanAccount(handle: string): Promise<{
  account: TikTokScanAccountResult;
  videos: TikTokScanVideo[];
}> {
  try {
    const profilePayload = await fetchTregTikTokProfile(handle);
    const profile = parseTregTikTokProfile(profilePayload);
    const username = profile?.username || handle;
    const secUid = profile?.secUid ?? "";
    if (!secUid) {
      return {
        account: {
          handle: username,
          nickname: profile?.nickname || username,
          followers: profile?.followers ?? null,
          videoCount: 0,
          error: "Could not resolve this profile for a video scan.",
        },
        videos: [],
      };
    }

    const videoPayload = await fetchTregTikTokUserVideos(secUid, 20);
    const videos = attachHandle(parseTregTikTokVideos(videoPayload, username), username);
    return {
      account: {
        handle: username,
        nickname: profile?.nickname || username,
        followers: profile?.followers ?? null,
        videoCount: videos.length,
        error: videos.length ? null : "No recent videos came back.",
      },
      videos,
    };
  } catch (error) {
    return {
      account: {
        handle,
        nickname: handle,
        followers: null,
        videoCount: 0,
        error: error instanceof Error ? error.message : "Scan failed.",
      },
      videos: [],
    };
  }
}

export async function runWatchScan(): Promise<TikTokScanPayload> {
  const accounts = await listWatchAccounts();
  if (!accounts.length) {
    throw new AccountingError("Add a watched account first.", 400, "validation_error");
  }

  const accountResults: TikTokScanAccountResult[] = [];
  const videos: TikTokScanVideo[] = [];
  for (const account of accounts) {
    const scanned = await scanAccount(account.handle);
    accountResults.push(scanned.account);
    videos.push(...scanned.videos);
    if (scanned.account.nickname || scanned.account.handle !== account.handle) {
      await getAccountingDb().companyTikTokAccount.update({
        where: { id: account.id },
        data: {
          uniqueId: scanned.account.handle,
          nickname: scanned.account.nickname,
        },
      }).catch(() => undefined);
    }
  }

  let trending: TikTokScanVideo[] = [];
  try {
    const raw = await fetchTregTikTokSearch(PIANO_TRENDING_QUERY, TIKTOK_SCAN_TOP);
    trending = attachHandle(parseTregTikTokSearch(raw), "piano");
  } catch {
    trending = [];
  }

  const payload = buildTikTokScanPayload(accountResults, videos, new Date(), trending);
  try {
    await persistScan(payload);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  return payload;
}
