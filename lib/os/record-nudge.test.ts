import assert from "node:assert/strict";
import test from "node:test";

import { berlinHour } from "./format";
import {
  RECORD_NUDGE_HOUR,
  RECORD_NUDGE_KIND,
  RECORD_NUDGE_LINES,
  RECORD_NUDGE_TAG,
  buildRecordNudgeNotification,
  pickRecordNudgeLine,
  shouldSendRecordNudge,
} from "./record-nudge";

test("picks a stable roast from the Berlin calendar day", () => {
  const first = pickRecordNudgeLine("2026-09-06");
  const again = pickRecordNudgeLine("2026-09-06");
  const next = pickRecordNudgeLine("2026-09-07");

  assert.equal(first.title, again.title);
  assert.equal(first.body, again.body);
  assert.ok(RECORD_NUDGE_LINES.includes(first));
  assert.notEqual(`${first.title}:${first.body}`, `${next.title}:${next.body}`);
});

test("falls back when the date stamp is junk", () => {
  assert.deepEqual(pickRecordNudgeLine("not-a-day"), RECORD_NUDGE_LINES[0]);
});

test("sends only at 20:00 Europe/Berlin, summer and winter", () => {
  const summerEight = new Date("2026-07-06T18:00:00.000Z");
  const summerSeven = new Date("2026-07-06T17:00:00.000Z");
  const winterEight = new Date("2026-01-06T19:00:00.000Z");
  const winterSeven = new Date("2026-01-06T18:00:00.000Z");

  assert.equal(berlinHour(summerEight), RECORD_NUDGE_HOUR);
  assert.equal(berlinHour(winterEight), RECORD_NUDGE_HOUR);
  assert.equal(shouldSendRecordNudge(summerEight), true);
  assert.equal(shouldSendRecordNudge(winterEight), true);
  assert.equal(shouldSendRecordNudge(summerSeven), false);
  assert.equal(shouldSendRecordNudge(winterSeven), false);
});

test("builds a Web Push payload that opens the TikTok tab", () => {
  const payload = buildRecordNudgeNotification("secret-key", new Date("2026-09-06T18:00:00.000Z"));
  assert.equal(payload.kind, RECORD_NUDGE_KIND);
  assert.equal(payload.tag, RECORD_NUDGE_TAG);
  assert.ok(payload.title.length > 0);
  assert.ok(payload.body.length > 0);
  assert.ok(payload.body.length <= 110);
  assert.match(payload.url, /\/bolag\/secret-key\/tiktok$/);
});
