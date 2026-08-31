import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNewPostNotification,
  buildNewPostsNotification,
  getVapidPublicKey,
  isGonePushStatus,
  isWebPushConfigured,
  parsePushSubscription,
  shortenNotificationBody,
  vaultPostPath,
} from "./push";

const accessKey = "test-accounting-access-key";

test("builds a notification that opens the new ledger post", () => {
  const payload = buildNewPostNotification(
    {
      id: "11111111-1111-4111-8111-111111111111",
      description: "ICA Maxi Kungsbacka",
      amount: "234.50",
      type: "Utbetalning",
    },
    { origin: "https://wallerstedt.live", accessKey },
  );

  assert.equal(payload.title, "ICA Maxi Kungsbacka");
  assert.match(payload.body, /234,50/);
  assert.match(payload.body, /Utbetalning/);
  assert.equal(
    payload.url,
    `https://wallerstedt.live/vault/${accessKey}?post=11111111-1111-4111-8111-111111111111`,
  );
});

test("summarizes several new posts into one notification", () => {
  const payload = buildNewPostsNotification(
    [
      { id: "a", description: "ICA", amount: "10", type: "Utbetalning" },
      { id: "b", description: "Hyra", amount: "20", type: "Utbetalning" },
    ],
    { origin: "https://wallerstedt.live", accessKey },
  );

  assert.equal(payload?.title, "2 nya poster");
  assert.equal(payload?.body, "ICA · Hyra");
  assert.equal(payload?.url, `https://wallerstedt.live${vaultPostPath("a", accessKey)}`);
});

test("falls back to a short default body and trims long copy", () => {
  const payload = buildNewPostNotification(
    { id: "post-1", description: "  ", amount: "not-a-number", type: "" },
    { origin: "https://wallerstedt.live", accessKey },
  );
  assert.equal(payload.title, "Ny bokföringspost");
  assert.equal(payload.body, "En ny post har bokförts.");
  assert.equal(shortenNotificationBody("A".repeat(140)).endsWith("…"), true);
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

test("requires VAPID keys and the vault access key before treating push as configured", () => {
  const environment = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public",
    VAPID_PRIVATE_KEY: "private",
    ACCOUNTING_ACCESS_KEY: "",
  } as unknown as NodeJS.ProcessEnv;

  assert.equal(getVapidPublicKey(environment), "public");
  assert.equal(isWebPushConfigured(environment), false);
});
