import assert from "node:assert/strict";
import test from "node:test";

import {
  berlinWeekKey,
  buildTikTokScanPayload,
  isJobLocked,
  isJobStale,
  isOpenScanPayload,
  isTikTokHandle,
  normalizeScanJobPayload,
  normalizeTikTokHandle,
  pickPendingAccount,
  publicCompletedScanJob,
  publicScanJobFromPayload,
  toPublicLastScan,
  PIANO_CATEGORY_QUERIES,
  TIKTOK_SCAN_LOCK_MS,
  TIKTOK_SCAN_STALE_MS,
  TIKTOK_SEED_HANDLES,
  WEEKLY_PIANO_TIKTOK_WATCH,
  type TikTokScanJobPayload,
} from "./tiktok-scan";
import { extractSongFromCaption, tiktokVideoUrl, type TikTokSearchResult } from "./tiktok-search";

function video(
  partial: Partial<TikTokSearchResult> & Pick<TikTokSearchResult, "awemeId" | "playCount">,
): TikTokSearchResult {
  return {
    uniqueId: "friqtao",
    desc: "",
    diggCount: 1,
    coverUrl: null,
    url: tiktokVideoUrl("friqtao", partial.awemeId),
    createTimeMs: null,
    song: null,
    handle: "friqtao",
    ...partial,
  } as TikTokSearchResult;
}

test("handles normalize from @, URL, or mixed case", () => {
  assert.equal(normalizeTikTokHandle("@FriqTao"), "friqtao");
  assert.equal(normalizeTikTokHandle("https://www.tiktok.com/@alejs_tunes/video/1"), "alejs_tunes");
  assert.equal(normalizeTikTokHandle("@tonyannn"), "tonyannn");
  assert.equal(normalizeTikTokHandle("Jon.Piano"), "jon.piano");
  assert.equal(isTikTokHandle("alejs_tunes"), true);
  assert.equal(isTikTokHandle("jon.piano"), true);
  assert.equal(isTikTokHandle("danny.vega18"), true);
  assert.equal(isTikTokHandle("no spaces"), false);
});

test("seed list keeps the original pair and the extra piano accounts", () => {
  assert.deepEqual([...TIKTOK_SEED_HANDLES], [
    "friqtao",
    "alejs_tunes",
    "tonyannn",
    "andy_morris",
    "willkim_3",
    "jon.piano",
    "danny.vega18",
    "alkis_ant",
  ]);
  for (const handle of TIKTOK_SEED_HANDLES) {
    assert.equal(isTikTokHandle(handle), true, handle);
  }
});

test("captions yield a song title when one is named", () => {
  assert.equal(extractSongFromCaption('song: Love Story - Indila'), "Love Story - Indila");
  assert.equal(extractSongFromCaption("♪ Midnight Hours"), "Midnight Hours");
  assert.equal(extractSongFromCaption('"Harbour Lights" late night take'), "Harbour Lights");
  assert.equal(extractSongFromCaption("original sound - friqtao"), null);
});

test("scan windows rank by views and keep 7/30 day buckets", () => {
  const now = new Date("2026-09-06T09:00:00+02:00");
  const nowMs = now.getTime();
  const payload = buildTikTokScanPayload(
    [{ handle: "friqtao", nickname: "Friq", followers: 10, videoCount: 3, error: null }],
    [
      {
        ...video({ awemeId: "old", playCount: 9_000_000 }),
        handle: "friqtao",
        createTimeMs: nowMs - 40 * 86_400_000,
      },
      {
        ...video({ awemeId: "week", playCount: 50_000 }),
        handle: "friqtao",
        createTimeMs: nowMs - 3 * 86_400_000,
      },
      {
        ...video({ awemeId: "month", playCount: 80_000 }),
        handle: "friqtao",
        createTimeMs: nowMs - 20 * 86_400_000,
      },
    ],
    now,
  );
  assert.deepEqual(
    payload.watchAllTime.map((item) => item.awemeId),
    ["old", "month", "week"],
  );
  assert.deepEqual(payload.allTime, payload.watchAllTime);
  assert.deepEqual(
    payload.watchLast7.map((item) => item.awemeId),
    ["week"],
  );
  assert.deepEqual(payload.last7, payload.watchLast7);
  assert.deepEqual(
    payload.watchLast30.map((item) => item.awemeId),
    ["month", "week"],
  );
  assert.deepEqual(payload.last30, payload.watchLast30);
  assert.deepEqual(payload.pianoLast7, []);
  assert.deepEqual(payload.pianoLast30, []);
  assert.equal(payload.routine, "weekly-piano-tiktok-watch");
  assert.match(payload.watchAllTime[0]!.url, /^https:\/\/www\.tiktok\.com\/@friqtao\/video\/old$/);
  assert.equal(berlinWeekKey(now), "2026-W36");
  assert.equal(payload.trending, undefined);
  assert.equal(payload.pianoTrending, undefined);
});

test("open scan payloads stay out of lastScan and expose a job cursor", () => {
  const now = "2026-09-06T08:00:00.000Z";
  const job = {
    scannedAt: now,
    weekKey: "2026-W36",
    routine: WEEKLY_PIANO_TIKTOK_WATCH,
    accounts: [],
    watchAllTime: [],
    watchLast7: [],
    watchLast30: [],
    allTime: [],
    last7: [],
    last30: [],
    pianoLast7: [],
    pianoLast30: [],
    pianoVideos: [],
    pianoQueriesPending: [...PIANO_CATEGORY_QUERIES],
    status: "running",
    scanId: "11111111-1111-4111-8111-111111111111",
    processed: 2,
    total: 8,
    nextHandle: "tonyannn",
    error: null,
    continueToken: "secret-token",
    pending: [
      { id: "a3", handle: "tonyannn" },
      { id: "a4", handle: "andy_morris" },
    ],
    accountResults: [],
    videos: [],
    trendingPending: true,
    lockedAt: null,
    startedAt: now,
  } satisfies TikTokScanJobPayload;

  assert.equal(isOpenScanPayload(job), true);
  assert.equal(toPublicLastScan(job), null);

  const publicJob = publicScanJobFromPayload(job);
  assert.equal(publicJob.status, "running");
  assert.equal(publicJob.processed, 2);
  assert.deepEqual(publicJob.next, { handle: "tonyannn", accountId: "a3" });
  assert.equal("continueToken" in publicJob, false);

  const completed = buildTikTokScanPayload(
    [{ handle: "friqtao", nickname: "Friq", followers: 1, videoCount: 1, error: null }],
    [{ ...video({ awemeId: "old", playCount: 9 }), handle: "friqtao" }],
    new Date(now),
  );
  const leaked = { ...completed, continueToken: "nope", status: "done", pending: [] };
  const cleaned = toPublicLastScan(leaked);
  assert.ok(cleaned);
  assert.equal("continueToken" in cleaned!, false);
  assert.equal("status" in cleaned!, false);
  assert.deepEqual(publicCompletedScanJob("scan-1", completed).status, "done");
});

test("pending picker matches handle, account id, or the next cursor", () => {
  const pending = [
    { id: "a1", handle: "friqtao" },
    { id: "a2", handle: "tonyannn" },
  ];
  assert.deepEqual(pickPendingAccount(pending), { account: pending[0], index: 0 });
  assert.deepEqual(pickPendingAccount(pending, "tonyannn"), { account: pending[1], index: 1 });
  assert.deepEqual(pickPendingAccount(pending, undefined, "a2"), { account: pending[1], index: 1 });
  assert.equal(pickPendingAccount(pending, "missing"), null);
  assert.equal(pickPendingAccount([], "friqtao"), null);
});

test("scan job lock and stale windows", () => {
  const now = Date.parse("2026-09-06T10:00:00.000Z");
  assert.equal(isJobLocked(new Date(now - 1_000).toISOString(), now), true);
  assert.equal(isJobLocked(new Date(now - TIKTOK_SCAN_LOCK_MS - 1).toISOString(), now), false);
  assert.equal(isJobLocked(null, now), false);
  assert.equal(isJobStale(new Date(now - TIKTOK_SCAN_STALE_MS - 1).toISOString(), now), true);
  assert.equal(isJobStale(new Date(now - 1_000).toISOString(), now), false);
});

test("scan payload can carry a piano-trending strip", () => {
  const now = new Date("2026-09-06T09:00:00+02:00");
  const payload = buildTikTokScanPayload(
    [],
    [ { ...video({ awemeId: "watched", playCount: 10 }), handle: "friqtao" } ],
    now,
    [ { ...video({ awemeId: "trend", playCount: 99, uniqueId: "keys" }), handle: "keys" } ],
  );
  assert.deepEqual(payload.pianoTrending?.map((item) => item.awemeId), ["trend"]);
  assert.deepEqual(payload.trending?.map((item) => item.awemeId), ["trend"]);
});

test("piano category windows split search results by createTime", () => {
  const now = new Date("2026-09-06T09:00:00+02:00");
  const nowMs = now.getTime();
  const payload = buildTikTokScanPayload(
    [],
    [
      {
        ...video({ awemeId: "watched-week", playCount: 40_000 }),
        handle: "friqtao",
        createTimeMs: nowMs - 2 * 86_400_000,
      },
    ],
    now,
    [
      {
        ...video({ awemeId: "piano-old", playCount: 9_000_000, uniqueId: "keys" }),
        handle: "keys",
        createTimeMs: nowMs - 60 * 86_400_000,
      },
      {
        ...video({ awemeId: "piano-week", playCount: 120_000, uniqueId: "softkeys" }),
        handle: "softkeys",
        createTimeMs: nowMs - 3 * 86_400_000,
      },
      {
        ...video({ awemeId: "piano-month", playCount: 400_000, uniqueId: "publicpiano" }),
        handle: "publicpiano",
        createTimeMs: nowMs - 18 * 86_400_000,
      },
    ],
  );
  assert.deepEqual(payload.watchLast7.map((item) => item.awemeId), ["watched-week"]);
  assert.deepEqual(payload.pianoLast7.map((item) => item.awemeId), ["piano-week"]);
  assert.deepEqual(payload.pianoLast30.map((item) => item.awemeId), ["piano-month", "piano-week"]);
  assert.deepEqual(payload.pianoTrending?.map((item) => item.awemeId), [
    "piano-old",
    "piano-month",
    "piano-week",
  ]);
  assert.equal(payload.watchLast7[0]?.awemeId === payload.pianoLast7[0]?.awemeId, false);
});

test("lastScan maps old watch keys and keeps piano fields public", () => {
  const completed = buildTikTokScanPayload(
    [{ handle: "friqtao", nickname: "Friq", followers: 1, videoCount: 1, error: null }],
    [{ ...video({ awemeId: "old", playCount: 9 }), handle: "friqtao" }],
    new Date("2026-09-06T08:00:00.000Z"),
    [{ ...video({ awemeId: "piano", playCount: 3, uniqueId: "keys", createTimeMs: Date.parse("2026-09-05T08:00:00.000Z") }), handle: "keys" }],
  );
  const { watchAllTime, watchLast7, watchLast30, pianoLast7, pianoLast30, ...legacy } = completed;
  const cleaned = toPublicLastScan({
    ...legacy,
    allTime: watchAllTime,
    last7: watchLast7,
    last30: watchLast30,
    pianoLast7,
    pianoLast30,
    continueToken: "nope",
    pianoVideos: [{ awemeId: "secret" }],
    pianoQueriesPending: ["piano cover"],
  });
  assert.ok(cleaned);
  assert.deepEqual(cleaned!.watchAllTime.map((item) => item.awemeId), ["old"]);
  assert.deepEqual(cleaned!.allTime, cleaned!.watchAllTime);
  assert.deepEqual(cleaned!.pianoLast7.map((item) => item.awemeId), ["piano"]);
  assert.deepEqual(cleaned!.pianoLast30.map((item) => item.awemeId), ["piano"]);
  assert.equal("continueToken" in cleaned!, false);
  assert.equal("pianoVideos" in cleaned!, false);
  assert.equal("pianoQueriesPending" in cleaned!, false);
});

test("open jobs without piano query lists still queue the category searches", () => {
  const now = "2026-09-06T08:00:00.000Z";
  const normalized = normalizeScanJobPayload({
    scannedAt: now,
    weekKey: "2026-W36",
    routine: WEEKLY_PIANO_TIKTOK_WATCH,
    accounts: [],
    watchAllTime: [],
    watchLast7: [],
    watchLast30: [],
    allTime: [],
    last7: [],
    last30: [],
    pianoLast7: [],
    pianoLast30: [],
    status: "running",
    scanId: "",
    processed: 8,
    total: 8,
    nextHandle: null,
    error: null,
    continueToken: "secret-token",
    pending: [],
    accountResults: [],
    videos: [],
    trendingPending: true,
    lockedAt: null,
    startedAt: now,
  }, "scan-legacy");
  assert.equal(normalized.scanId, "scan-legacy");
  assert.deepEqual(normalized.pianoQueriesPending, [...PIANO_CATEGORY_QUERIES]);
  assert.equal(normalized.trendingPending, true);
  assert.deepEqual(normalized.pianoVideos, []);
});
