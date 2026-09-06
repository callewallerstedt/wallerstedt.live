import { COMPANY } from "./company";
import {
  rankTikTokResults,
  type TikTokSearchResult,
} from "./tiktok-search";

export type TikTokWatchAccount = {
  id: string;
  handle: string;
  uniqueId: string;
  nickname: string;
  sortOrder: number;
};

export const TIKTOK_SEED_HANDLES = [
  "friqtao",
  "alejs_tunes",
  "tonyannn",
  "andy_morris",
  "willkim_3",
  "jon.piano",
  "danny.vega18",
  "alkis_ant",
] as const;
export const TIKTOK_SCAN_TOP = 8;
export const WEEKLY_PIANO_TIKTOK_WATCH = "weekly-piano-tiktok-watch";
/** Treg search used for the piano-trending strip on Scan now. */
export const PIANO_TRENDING_QUERY = "piano cover";

export type TikTokScanVideo = TikTokSearchResult & {
  handle: string;
};

export type TikTokScanAccountResult = {
  handle: string;
  nickname: string;
  followers: number | null;
  videoCount: number;
  error: string | null;
};

export type TikTokScanPayload = {
  scannedAt: string;
  weekKey: string;
  routine: typeof WEEKLY_PIANO_TIKTOK_WATCH;
  accounts: TikTokScanAccountResult[];
  allTime: TikTokScanVideo[];
  last7: TikTokScanVideo[];
  last30: TikTokScanVideo[];
  /** Optional Treg "piano cover" strip; UI falls back to allTime. */
  trending?: TikTokScanVideo[];
};

export const TIKTOK_SCAN_JOB_STATUSES = ["started", "running", "done", "failed"] as const;
export type TikTokScanJobStatus = (typeof TIKTOK_SCAN_JOB_STATUSES)[number];

export const TIKTOK_SCAN_OPEN_STATUSES = ["started", "running"] as const;
export type TikTokScanOpenStatus = (typeof TIKTOK_SCAN_OPEN_STATUSES)[number];

/** One Treg profile + videos burst must finish under Vercel's ~60s cap. */
export const TIKTOK_SCAN_LOCK_MS = 90_000;
/** A stuck job can be replaced after this. */
export const TIKTOK_SCAN_STALE_MS = 25 * 60_000;

export type TikTokScanPendingAccount = {
  id: string;
  handle: string;
};

export type TikTokScanCursor = {
  handle: string;
  accountId: string;
};

export type TikTokScanJobPublic = {
  scanId: string;
  status: TikTokScanJobStatus;
  processed: number;
  total: number;
  nextHandle: string | null;
  next: TikTokScanCursor | null;
  error: string | null;
};

export type TikTokScanJobPayload = TikTokScanPayload & {
  status: TikTokScanOpenStatus;
  scanId: string;
  processed: number;
  total: number;
  nextHandle: string | null;
  error: string | null;
  continueToken: string;
  pending: TikTokScanPendingAccount[];
  accountResults: TikTokScanAccountResult[];
  videos: TikTokScanVideo[];
  trendingPending: boolean;
  lockedAt: string | null;
  startedAt: string;
};

export function isOpenScanStatus(status: unknown): status is TikTokScanOpenStatus {
  return status === "started" || status === "running";
}

export function isScanJobStatus(status: unknown): status is TikTokScanJobStatus {
  return (
    status === "started" ||
    status === "running" ||
    status === "done" ||
    status === "failed"
  );
}

export function isOpenScanPayload(payload: unknown): payload is TikTokScanJobPayload {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as { status?: unknown };
  return isOpenScanStatus(value.status);
}

export function scanCursor(account: TikTokScanPendingAccount | null | undefined): TikTokScanCursor | null {
  if (!account) return null;
  return { handle: account.handle, accountId: account.id };
}

export function publicScanJob(input: {
  scanId: string;
  status: TikTokScanJobStatus;
  processed: number;
  total: number;
  nextHandle?: string | null;
  next?: TikTokScanCursor | null;
  error?: string | null;
}): TikTokScanJobPublic {
  const next = input.next ?? null;
  return {
    scanId: input.scanId,
    status: input.status,
    processed: input.processed,
    total: input.total,
    nextHandle: input.nextHandle ?? next?.handle ?? null,
    next,
    error: input.error ?? null,
  };
}

export function publicScanJobFromPayload(
  payload: TikTokScanJobPayload,
  scanId = payload.scanId,
): TikTokScanJobPublic {
  const next = scanCursor(payload.pending[0] ?? null);
  return {
    scanId,
    status: payload.status,
    processed: payload.processed,
    total: payload.total,
    nextHandle: next?.handle ?? payload.nextHandle,
    next,
    error: payload.error,
  };
}

export function publicCompletedScanJob(
  scanId: string,
  payload: TikTokScanPayload,
): TikTokScanJobPublic {
  const total = payload.accounts.length;
  return {
    scanId,
    status: "done",
    processed: total,
    total,
    nextHandle: null,
    next: null,
    error: null,
  };
}

const JOB_ONLY_KEYS = [
  "status",
  "scanId",
  "processed",
  "total",
  "nextHandle",
  "error",
  "continueToken",
  "pending",
  "accountResults",
  "videos",
  "trendingPending",
  "lockedAt",
  "startedAt",
] as const;

export function toPublicLastScan(payload: unknown): TikTokScanPayload | null {
  if (!payload || typeof payload !== "object") return null;
  if (isOpenScanPayload(payload)) return null;
  const value = payload as TikTokScanPayload & Record<string, unknown>;
  if (value.status === "failed") return null;
  if (!Array.isArray(value.accounts) || !Array.isArray(value.allTime)) return null;
  const publicPayload: TikTokScanPayload = {
    scannedAt: typeof value.scannedAt === "string" ? value.scannedAt : new Date().toISOString(),
    weekKey: typeof value.weekKey === "string" ? value.weekKey : "",
    routine: WEEKLY_PIANO_TIKTOK_WATCH,
    accounts: value.accounts,
    allTime: value.allTime,
    last7: Array.isArray(value.last7) ? value.last7 : [],
    last30: Array.isArray(value.last30) ? value.last30 : [],
    ...(Array.isArray(value.trending) ? { trending: value.trending } : {}),
  };
  for (const key of JOB_ONLY_KEYS) delete (publicPayload as Record<string, unknown>)[key];
  return publicPayload;
}

export function pickPendingAccount(
  pending: TikTokScanPendingAccount[],
  handle?: string,
  accountId?: string,
) {
  if (accountId) {
    const index = pending.findIndex((account) => account.id === accountId);
    return index >= 0 ? { account: pending[index]!, index } : null;
  }
  if (handle) {
    const index = pending.findIndex((account) => account.handle === handle);
    return index >= 0 ? { account: pending[index]!, index } : null;
  }
  if (!pending.length) return null;
  return { account: pending[0]!, index: 0 };
}

export function jobLockAgeMs(lockedAt: string | null | undefined, now = Date.now()) {
  if (!lockedAt) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(lockedAt);
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return now - parsed;
}

export function isJobLocked(lockedAt: string | null | undefined, now = Date.now()) {
  return jobLockAgeMs(lockedAt, now) < TIKTOK_SCAN_LOCK_MS;
}

export function isJobStale(startedAt: string | undefined, now = Date.now()) {
  if (!startedAt) return false;
  const parsed = Date.parse(startedAt);
  if (Number.isNaN(parsed)) return false;
  return now - parsed > TIKTOK_SCAN_STALE_MS;
}

export function normalizeTikTokHandle(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function isTikTokHandle(value: string) {
  return /^[a-z0-9._]{2,24}$/i.test(normalizeTikTokHandle(value));
}

/** ISO week in the company timezone, e.g. 2026-W36. */
export function berlinWeekKey(now = new Date(), timeZone = COMPANY.timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (!year || !month || !day) return "";
  const utc = new Date(Date.UTC(year, month - 1, day));
  const thursday = new Date(utc);
  thursday.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function withinDays(video: TikTokScanVideo, days: number, nowMs: number) {
  if (video.createTimeMs == null) return false;
  return nowMs - video.createTimeMs <= days * 86_400_000;
}

export function attachHandle(videos: TikTokSearchResult[], handle: string): TikTokScanVideo[] {
  return videos.map((video) => ({ ...video, handle: video.uniqueId || handle }));
}

export function buildTikTokScanPayload(
  accounts: TikTokScanAccountResult[],
  videos: TikTokScanVideo[],
  now = new Date(),
  trending?: TikTokScanVideo[],
): TikTokScanPayload {
  const nowMs = now.getTime();
  const ranked = rankTikTokResults(videos) as TikTokScanVideo[];
  const trend =
    trending && trending.length
      ? (rankTikTokResults(trending).slice(0, TIKTOK_SCAN_TOP) as TikTokScanVideo[])
      : undefined;
  return {
    scannedAt: now.toISOString(),
    weekKey: berlinWeekKey(now),
    routine: WEEKLY_PIANO_TIKTOK_WATCH,
    accounts,
    allTime: ranked.slice(0, TIKTOK_SCAN_TOP),
    last7: rankTikTokResults(ranked.filter((video) => withinDays(video, 7, nowMs))).slice(
      0,
      TIKTOK_SCAN_TOP,
    ) as TikTokScanVideo[],
    last30: rankTikTokResults(ranked.filter((video) => withinDays(video, 30, nowMs))).slice(
      0,
      TIKTOK_SCAN_TOP,
    ) as TikTokScanVideo[],
    ...(trend ? { trending: trend } : {}),
  };
}
