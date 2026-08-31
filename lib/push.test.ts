import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNewSongNotification,
  DEFAULT_SITE_ORIGIN,
  getVapidPublicKey,
  isGonePushStatus,
  isWebPushConfigured,
  parsePushSubscription,
  shortenNotificationBody,
} from "./push";

test("builds a notification that opens the new song page", () => {
  assert.deepEqual(
    buildNewSongNotification(
      {
        title: "emergence",
        blurb: "A quiet piano piece.",
        slug: "emergence",
      },
      "https://wallerstedt.live",
    ),
    {
      title: "emergence",
      body: "A quiet piano piece.",
      url: "https://wallerstedt.live/emergence",
    },
  );
});

test("falls back to a short default body and trims long blurbs", () => {
  assert.equal(
    buildNewSongNotification({ title: "dusk", blurb: "", slug: "dusk" }).body,
    "New piano music is out.",
  );
  assert.equal(
    shortenNotificationBody("A".repeat(140)).endsWith("…"),
    true,
  );
  assert.ok(shortenNotificationBody("A".repeat(140)).length <= 110);
});

test("accepts only https push subscriptions with VAPID keys", () => {
  assert.equal(parsePushSubscription(null), null);
  assert.equal(
    parsePushSubscription({
      endpoint: "http://example.com/push",
      keys: { p256dh: "abcd1234", auth: "efgh5678" },
    }),
    null,
  );
  assert.deepEqual(
    parsePushSubscription({
      endpoint: "https://web.push.apple.com/abc",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    }),
    {
      endpoint: "https://web.push.apple.com/abc",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    },
  );
});

test("treats expired push endpoints as gone", () => {
  assert.equal(isGonePushStatus(410), true);
  assert.equal(isGonePushStatus(404), true);
  assert.equal(isGonePushStatus(500), false);
});

test("requires VAPID keys before treating push as configured", () => {
  const environment = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public",
    VAPID_PRIVATE_KEY: "",
  } as unknown as NodeJS.ProcessEnv;

  assert.equal(getVapidPublicKey(environment), "public");
  assert.equal(isWebPushConfigured(environment), false);
  assert.equal(DEFAULT_SITE_ORIGIN, "https://wallerstedt.live");
});
