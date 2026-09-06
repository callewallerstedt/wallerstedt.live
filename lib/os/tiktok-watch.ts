import { getAccountingDb } from "@/lib/accounting/db";
import { AccountingError } from "@/lib/accounting/errors";

import {
  attachHandle,
  buildTikTokScanPayload,
  isTikTokHandle,
  normalizeTikTokHandle,
  TIKTOK_SEED_HANDLES,
  type TikTokScanAccountResult,
  type TikTokScanPayload,
  type TikTokScanVideo,
  type TikTokWatchAccount,
} from "./tiktok-scan";

export type { TikTokWatchAccount };
import { parseTregTikTokProfile, parseTregTikTokVideos } from "./tiktok-search";
import { fetchTregTikTokProfile, fetchTregTikTokUserVideos } from "./tiktok-treg";

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

export async function listWatchAccounts(): Promise<TikTokWatchAccount[]> {
  const db = getAccountingDb();
  try {
    let rows = await db.companyTikTokAccount.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (!rows.length) {
      await db.companyTikTokAccount.createMany({
        data: TIKTOK_SEED_HANDLES.map((handle, index) => ({
          handle,
          uniqueId: handle,
          sortOrder: index,
        })),
      });
      rows = await db.companyTikTokAccount.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    }
    return rows.map((row) => ({
      id: row.id,
      handle: row.handle,
      uniqueId: row.uniqueId || row.handle,
      nickname: row.nickname,
      sortOrder: row.sortOrder,
    }));
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

export async function removeWatchAccount(id: string): Promise<TikTokWatchAccount[]> {
  const db = getAccountingDb();
  try {
    await db.companyTikTokAccount.deleteMany({ where: { id } });
  } catch (error) {
    if (isMissingTable(error)) throw watchUnavailable();
    throw error;
  }
  return listWatchAccounts();
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

  const payload = buildTikTokScanPayload(accountResults, videos);
  try {
    await persistScan(payload);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  return payload;
}
