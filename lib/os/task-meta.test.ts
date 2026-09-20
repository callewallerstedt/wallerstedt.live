import assert from "node:assert/strict";
import test from "node:test";

import {
  tiktokPianoSearchQuery,
  tiktokPianoSearchUrl,
  tiktokWallerstedtSearchQuery,
  tiktokWallerstedtSearchUrl,
} from "./task-meta";

test("TikTok piano search hits the video results path with a timestamp", () => {
  assert.equal(tiktokPianoSearchQuery("Midnight Hours"), "Midnight Hours piano");
  const url = new URL(tiktokPianoSearchUrl("Midnight Hours", 1_725_000_000_000));
  assert.equal(url.origin + url.pathname, "https://www.tiktok.com/search/video");
  assert.equal(url.searchParams.get("q"), "Midnight Hours piano");
  assert.equal(url.searchParams.get("t"), "1725000000000");
});

test("TikTok Wallerstedt search opens song + wallerstedt on video results", () => {
  assert.equal(tiktokWallerstedtSearchQuery(" Love Story Indila "), "Love Story Indila wallerstedt");
  const url = new URL(tiktokWallerstedtSearchUrl("Midnight Hours", 1_725_000_000_000));
  assert.equal(url.origin + url.pathname, "https://www.tiktok.com/search/video");
  assert.equal(url.searchParams.get("q"), "Midnight Hours wallerstedt");
  assert.equal(url.searchParams.get("t"), "1725000000000");
});
