import assert from "node:assert/strict";
import test from "node:test";

import {
  berlinWeekKey,
  buildTikTokScanPayload,
  isTikTokHandle,
  normalizeTikTokHandle,
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
  assert.equal(isTikTokHandle("alejs_tunes"), true);
  assert.equal(isTikTokHandle("no spaces"), false);
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
});
