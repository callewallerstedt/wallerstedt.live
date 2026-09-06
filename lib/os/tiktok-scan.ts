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
