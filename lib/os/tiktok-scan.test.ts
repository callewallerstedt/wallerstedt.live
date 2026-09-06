import assert from "node:assert/strict";
import test from "node:test";

import {
  berlinWeekKey,
  buildTikTokScanPayload,
  isTikTokHandle,
  normalizeTikTokHandle,
  TIKTOK_SEED_HANDLES,
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
    payload.allTime.map((item) => item.awemeId),
    ["old", "month", "week"],
  );
  assert.deepEqual(
    payload.last7.map((item) => item.awemeId),
    ["week"],
  );
  assert.deepEqual(
    payload.last30.map((item) => item.awemeId),
    ["month", "week"],
  );
  assert.equal(payload.routine, "weekly-piano-tiktok-watch");
  assert.match(payload.allTime[0]!.url, /^https:\/\/www\.tiktok\.com\/@friqtao\/video\/old$/);
  assert.equal(berlinWeekKey(now), "2026-W36");
  assert.equal(payload.trending, undefined);
});

test("scan payload can carry a piano-trending strip", () => {
  const now = new Date("2026-09-06T09:00:00+02:00");
  const payload = buildTikTokScanPayload(
    [],
    [ { ...video({ awemeId: "watched", playCount: 10 }), handle: "friqtao" } ],
    now,
    [ { ...video({ awemeId: "trend", playCount: 99, uniqueId: "keys" }), handle: "keys" } ],
  );
  assert.deepEqual(payload.trending?.map((item) => item.awemeId), ["trend"]);
});
