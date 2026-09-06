import { getAccountingDb } from "@/lib/accounting/db";
import { AccountingError } from "@/lib/accounting/errors";

import { randomBytes } from "node:crypto";

import { secretEqual } from "@/lib/accounting/auth";

import {
  attachHandle,
  berlinWeekKey,
  buildTikTokScanPayload,
  dedupeScanVideos,
  isJobLocked,
  isJobStale,
  isOpenScanPayload,
  isTikTokHandle,
  normalizeScanJobPayload,
  normalizeTikTokHandle,
  pianoQueriesRemaining,
  pickPendingAccount,
  publicCompletedScanJob,
  publicScanJobFromPayload,
  toPublicLastScan,
  PIANO_CATEGORY_QUERIES,
  TIKTOK_SEED_HANDLES,
  WEEKLY_PIANO_TIKTOK_WATCH,
  type TikTokScanAccountResult,
  type TikTokScanJobPayload,
  type TikTokScanJobPublic,
  type TikTokScanPayload,
  type TikTokScanPendingAccount,
  type TikTokScanVideo,
  type TikTokWatchAccount,
} from "./tiktok-scan";

export type { TikTokWatchAccount };
import {
  parseTregTikTokProfile,
  parseTregTikTokSearch,
  parseTregTikTokVideos,
  TIKTOK_SEARCH_MAX_LIMIT,
} from "./tiktok-search";
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

type ScanRow = {
  id: string;
  scannedAt: Date;
  weekKey: string;
  payload: unknown;
};

export type TikTokScanPostResult = {
  ok: true;
  status: TikTokScanJobPublic["status"];
  scanId: string;
  processed: number;
  total: number;
  next: TikTokScanJobPublic["next"];
  scan: TikTokScanJobPublic;
  lastScan: TikTokScanPayload | null;
  continueToken?: string;
  /** True when this invocation actually scanned an account or wrote the final payload. */
  advanced?: boolean;
};

function asJobPayload(payload: unknown, scanId: string): TikTokScanJobPayload | null {
  if (!isOpenScanPayload(payload)) return null;
  return normalizeScanJobPayload(
    {
      ...(payload as TikTokScanJobPayload),
      scanId: payload.scanId || scanId,
    },
    scanId,
  );
}

async function listScanRows(take = 16): Promise<ScanRow[]> {
  const db = getAccountingDb();
  try {
    return await db.companyTikTokScan.findMany({
      orderBy: { scannedAt: "desc" },
      take,
    });
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export async function latestWatchScan(): Promise<TikTokScanPayload | null> {
  const rows = await listScanRows();
  for (const row of rows) {
    const payload = toPublicLastScan(row.payload);
    if (payload) return payload;
  }
  return null;
}

export async function listWatchScans(limit = 8): Promise<TikTokScanPayload[]> {
  const take = Math.min(Math.max(1, Math.round(limit)), 8);
  const rows = await listScanRows(24);
  const scans: TikTokScanPayload[] = [];
  for (const row of rows) {
    const payload = toPublicLastScan(row.payload);
    if (!payload) continue;
    scans.push(payload);
    if (scans.length >= take) break;
  }
  return scans;
}

async function pruneCompletedScans(keepId?: string) {
  const db = getAccountingDb();
  const rows = await listScanRows(32);
  const completed = rows.filter((row) => row.id !== keepId && !isOpenScanPayload(row.payload));
  const stale = completed.slice(8);
  if (stale.length) {
    await db.companyTikTokScan.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }
}

function jobFromRow(row: ScanRow): TikTokScanJobPayload | null {
  return asJobPayload(row.payload, row.id);
}

async function latestOpenJobRow(): Promise<{ row: ScanRow; job: TikTokScanJobPayload } | null> {
  const rows = await listScanRows();
  for (const row of rows) {
    const job = jobFromRow(row);
    if (job) return { row, job };
  }
  return null;
}

async function latestCompletedRow(): Promise<ScanRow | null> {
  const rows = await listScanRows();
  return rows.find((row) => toPublicLastScan(row.payload)) ?? null;
}

export async function readWatchScanView(): Promise<{
  lastScan: TikTokScanPayload | null;
  scan: TikTokScanJobPublic | null;
  continueToken: string | null;
  openScanId: string | null;
}> {
  const [open, completed, lastScan] = await Promise.all([
    latestOpenJobRow(),
    latestCompletedRow(),
    latestWatchScan(),
  ]);
  if (open) {
    return {
      lastScan,
      scan: publicScanJobFromPayload(open.job, open.row.id),
      continueToken: open.job.continueToken,
      openScanId: open.row.id,
    };
  }
  if (completed) {
    const payload = toPublicLastScan(completed.payload);
    return {
      lastScan: payload,
      scan: payload ? publicCompletedScanJob(completed.id, payload) : null,
      continueToken: null,
      openScanId: null,
    };
  }
  return { lastScan: null, scan: null, continueToken: null, openScanId: null };
}

function toPostResult(
  scan: TikTokScanJobPublic,
  lastScan: TikTokScanPayload | null,
  continueToken?: string,
  advanced = false,
): TikTokScanPostResult {
  return {
    ok: true,
    status: scan.status,
    scanId: scan.scanId,
    processed: scan.processed,
    total: scan.total,
    next: scan.next,
    scan,
    lastScan,
    ...(continueToken ? { continueToken } : {}),
    ...(advanced ? { advanced: true } : {}),
  };
}

export function publicWatchScanPost(result: TikTokScanPostResult): Omit<TikTokScanPostResult, "continueToken" | "advanced"> {
  const { continueToken: _token, advanced: _advanced, ...publicResult } = result;
  return publicResult;
}

async function writeJob(rowId: string, job: TikTokScanJobPayload) {
  const db = getAccountingDb();
  const preview = buildTikTokScanPayload(
    job.accountResults,
    job.videos,
    new Date(job.scannedAt),
    job.pianoVideos,
  );
  const payload: TikTokScanJobPayload = {
    ...job,
    ...preview,
    status: job.status,
    scanId: rowId,
    processed: job.processed,
    total: job.total,
    nextHandle: job.pending[0]?.handle ?? null,
    error: job.error,
    continueToken: job.continueToken,
    pending: job.pending,
    accountResults: job.accountResults,
    videos: job.videos,
    pianoVideos: job.pianoVideos,
    pianoQueriesPending: job.pianoQueriesPending,
    trendingPending: job.pianoQueriesPending.length > 0,
    lockedAt: job.lockedAt,
    startedAt: job.startedAt,
  };
  await db.companyTikTokScan.update({
    where: { id: rowId },
    data: {
      weekKey: payload.weekKey,
      payload,
    },
  });
  return payload;
}

async function failJob(rowId: string, job: TikTokScanJobPayload, message: string) {
  const db = getAccountingDb();
  const failed = {
    ...buildTikTokScanPayload(job.accountResults, job.videos, new Date(), job.pianoVideos),
    status: "failed" as const,
    scanId: rowId,
    processed: job.processed,
    total: job.total,
    nextHandle: job.pending[0]?.handle ?? null,
    error: message,
  };
  await db.companyTikTokScan.update({
    where: { id: rowId },
    data: { payload: failed },
  });
  return {
    scanId: rowId,
    status: "failed" as const,
    processed: job.processed,
    total: job.total,
    nextHandle: job.pending[0]?.handle ?? null,
    next: job.pending[0] ? { handle: job.pending[0].handle, accountId: job.pending[0].id } : null,
    error: message,
    continueToken: job.continueToken,
  };
}

async function createWatchScanJob(accounts: TikTokWatchAccount[]): Promise<{
  rowId: string;
  job: TikTokScanJobPayload;
}> {
  const db = getAccountingDb();
  const now = new Date();
  const pending: TikTokScanPendingAccount[] = accounts.map((account) => ({
    id: account.id,
    handle: account.handle,
  }));
  const continueToken = randomBytes(24).toString("hex");
  const empty = buildTikTokScanPayload([], [], now);
  const job: TikTokScanJobPayload = {
    ...empty,
    status: "started",
    scanId: "",
    processed: 0,
    total: pending.length,
    nextHandle: pending[0]?.handle ?? null,
    error: null,
    continueToken,
    pending,
    accountResults: [],
    videos: [],
    pianoVideos: [],
    pianoQueriesPending: [...PIANO_CATEGORY_QUERIES],
    trendingPending: true,
    lockedAt: null,
    startedAt: now.toISOString(),
  };
  const row = await db.companyTikTokScan.create({
    data: {
      scannedAt: now,
      weekKey: berlinWeekKey(now) || WEEKLY_PIANO_TIKTOK_WATCH,
      payload: job,
    },
  });
  job.scanId = row.id;
  await db.companyTikTokScan.update({
    where: { id: row.id },
    data: { payload: { ...job, scanId: row.id } },
  });
  return { rowId: row.id, job: { ...job, scanId: row.id } };
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

async function updateWatchedProfile(accountId: string, account: TikTokScanAccountResult, requestedHandle: string) {
  if (!account.nickname && account.handle === requestedHandle) return;
  await getAccountingDb()
    .companyTikTokAccount.update({
      where: { id: accountId },
      data: {
        uniqueId: account.handle,
        nickname: account.nickname,
      },
    })
    .catch(() => undefined);
}

async function finalizeJob(rowId: string, job: TikTokScanJobPayload, pianoVideos: TikTokScanVideo[] | undefined) {
  const db = getAccountingDb();
  const payload = buildTikTokScanPayload(job.accountResults, job.videos, new Date(), pianoVideos);
  try {
    await db.companyTikTokScan.update({
      where: { id: rowId },
      data: {
        scannedAt: new Date(payload.scannedAt),
        weekKey: payload.weekKey,
        payload,
      },
    });
    await pruneCompletedScans(rowId);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  return {
    scan: publicCompletedScanJob(rowId, payload),
    lastScan: payload,
    continueToken: job.continueToken,
  };
}

async function fetchPianoCategoryVideos(query: string): Promise<TikTokScanVideo[]> {
  try {
    const raw = await fetchTregTikTokSearch(query, TIKTOK_SEARCH_MAX_LIMIT);
    return attachHandle(parseTregTikTokSearch(raw), "piano");
  } catch {
    return [];
  }
}

export async function processWatchScanBurst(
  scanId: string,
  options: { handle?: string; accountId?: string; token?: string } = {},
): Promise<TikTokScanPostResult | null> {
  const db = getAccountingDb();
  let row: ScanRow;
  try {
    row = await db.companyTikTokScan.findUniqueOrThrow({ where: { id: scanId } });
  } catch (error) {
    if (isMissingTable(error)) throw watchUnavailable();
    throw new AccountingError("That scan was not found.", 404, "not_found");
  }

  const job = jobFromRow(row);
  if (!job) {
    const lastScan = toPublicLastScan(row.payload) ?? (await latestWatchScan());
    if (!lastScan) return null;
    return toPostResult(publicCompletedScanJob(row.id, lastScan), lastScan);
  }

  if (options.token && !secretEqual(options.token, job.continueToken)) {
    throw new AccountingError("Unauthorized.", 401, "unauthorized");
  }

  if (isJobStale(job.startedAt)) {
    const failed = await failJob(row.id, job, "Scan timed out. POST /tiktok/watch/scan again to start a new one.");
    return toPostResult(failed, await latestWatchScan(), job.continueToken);
  }

  if (isJobLocked(job.lockedAt)) {
    return toPostResult(publicScanJobFromPayload(job, row.id), await latestWatchScan(), job.continueToken);
  }

  const requestedHandle = options.handle ? normalizeTikTokHandle(options.handle) : "";
  const requestedId = options.accountId?.trim() ?? "";
  const picked = pickPendingAccount(job.pending, requestedHandle || undefined, requestedId || undefined);

  if ((requestedHandle || requestedId) && !picked) {
    const alreadyDone = job.accountResults.some((account) => account.handle === requestedHandle);
    if (alreadyDone || (!job.pending.length && pianoQueriesRemaining(job))) {
      return toPostResult(publicScanJobFromPayload(job, row.id), await latestWatchScan(), job.continueToken);
    }
    throw new AccountingError("That watched account is not part of this scan.", 400, "validation_error");
  }

  if (!picked) {
    const queries = job.pianoQueriesPending;
    if (!queries.length) {
      const finished = await finalizeJob(row.id, job, job.pianoVideos);
      return toPostResult(finished.scan, finished.lastScan, job.continueToken, true);
    }
    const query = queries[0];
    const rest = queries.slice(1);
    if (!query) {
      const finished = await finalizeJob(row.id, { ...job, pianoQueriesPending: [], trendingPending: false }, job.pianoVideos);
      return toPostResult(finished.scan, finished.lastScan, job.continueToken, true);
    }
    await writeJob(row.id, { ...job, lockedAt: new Date().toISOString(), status: "running" });
    const found = await fetchPianoCategoryVideos(query);
    const pianoVideos = dedupeScanVideos([...job.pianoVideos, ...found]);
    const nextJob: TikTokScanJobPayload = {
      ...job,
      status: "running",
      pianoVideos,
      pianoQueriesPending: rest,
      trendingPending: rest.length > 0,
      lockedAt: null,
      error: null,
    };
    if (!rest.length) {
      const finished = await finalizeJob(row.id, nextJob, pianoVideos);
      return toPostResult(finished.scan, finished.lastScan, job.continueToken, true);
    }
    await writeJob(row.id, nextJob);
    return toPostResult(publicScanJobFromPayload(nextJob, row.id), await latestWatchScan(), job.continueToken, true);
  }

  const remaining = job.pending.filter((_, index) => index !== picked.index);
  await writeJob(row.id, {
    ...job,
    status: "running",
    lockedAt: new Date().toISOString(),
    pending: remaining,
    nextHandle: remaining[0]?.handle ?? null,
  });

  const scanned = await scanAccount(picked.account.handle);
  await updateWatchedProfile(picked.account.id, scanned.account, picked.account.handle);

  const nextJob: TikTokScanJobPayload = {
    ...job,
    status: "running",
    processed: job.processed + 1,
    pending: remaining,
    accountResults: [...job.accountResults, scanned.account],
    videos: [...job.videos, ...scanned.videos],
    lockedAt: null,
    nextHandle: remaining[0]?.handle ?? null,
    error: null,
  };

  await writeJob(row.id, nextJob);
  return toPostResult(publicScanJobFromPayload(nextJob, row.id), await latestWatchScan(), job.continueToken, true);
}

export async function authorizeWatchScanContinue(scanId: string, token: string) {
  if (!scanId || !token) {
    throw new AccountingError("Unauthorized.", 401, "unauthorized");
  }
  const db = getAccountingDb();
  let row: ScanRow;
  try {
    row = await db.companyTikTokScan.findUniqueOrThrow({ where: { id: scanId } });
  } catch (error) {
    if (isMissingTable(error)) throw watchUnavailable();
    throw new AccountingError("That scan was not found.", 404, "not_found");
  }
  const job = jobFromRow(row);
  if (!job) {
    return { open: false as const, scanId: row.id };
  }
  if (!secretEqual(token, job.continueToken)) {
    throw new AccountingError("Unauthorized.", 401, "unauthorized");
  }
  return { open: true as const, scanId: row.id, token: job.continueToken };
}

export type WatchScanRequest = {
  handle?: string;
  accountId?: string;
  scanId?: string;
};

export async function requestWatchScan(input: WatchScanRequest = {}): Promise<TikTokScanPostResult> {
  const handle = input.handle ? normalizeTikTokHandle(input.handle) : "";
  if (input.handle && !isTikTokHandle(handle)) {
    throw new AccountingError("That does not look like a TikTok handle.", 400, "validation_error");
  }
  const accountId = input.accountId?.trim() ?? "";
  const scanId = input.scanId?.trim() ?? "";
  const wantsBurst = Boolean(handle || accountId || scanId);

  const accounts = await listWatchAccounts();
  if (!accounts.length) {
    throw new AccountingError("Add a watched account first.", 400, "validation_error");
  }
  if (handle && !accounts.some((account) => account.handle === handle)) {
    throw new AccountingError("That handle is not on the watch list.", 400, "validation_error");
  }
  if (accountId && !accounts.some((account) => account.id === accountId)) {
    throw new AccountingError("That watched account was not found.", 404, "not_found");
  }

  let open = await latestOpenJobRow();
  if (open && isJobStale(open.job.startedAt)) {
    await failJob(open.row.id, open.job, "Scan timed out. POST /tiktok/watch/scan again to start a new one.");
    open = null;
  }

  if (scanId) {
    const burst = await processWatchScanBurst(scanId, { handle, accountId });
    if (!burst) {
      throw new AccountingError("That scan was not found.", 404, "not_found");
    }
    return burst;
  }

  if (!open) {
    const created = await createWatchScanJob(accounts);
    open = { row: { id: created.rowId, scannedAt: new Date(), weekKey: created.job.weekKey, payload: created.job }, job: created.job };
  }

  if (!wantsBurst) {
    return toPostResult(
      publicScanJobFromPayload(open.job, open.row.id),
      await latestWatchScan(),
      open.job.continueToken,
    );
  }

  const burst = await processWatchScanBurst(open.row.id, { handle, accountId });
  if (!burst) {
    throw new AccountingError("That scan was not found.", 404, "not_found");
  }
  return burst;
}
