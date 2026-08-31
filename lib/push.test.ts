import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNewPostNotification,
  buildPostNotification,
  buildPostsNotification,
  classifyEntryPatch,
  getVapidPublicKey,
  isGonePushStatus,
  isWebPushConfigured,
  parseAccountingPushOpen,
  parsePushSubscription,
  postIdFromNotificationUrl,
  shortenNotificationBody,
  vaultPostPath,
} from "./push";

const accessKey = "test-accounting-access-key";
const postId = "11111111-1111-4111-8111-111111111111";

test("builds a create notification that names the action and opens that post", () => {
  const payload = buildPostNotification(
    "create",
    {
      id: postId,
      description: "ICA Maxi Kungsbacka",
      amount: "234.50",
      type: "Utbetalning",
    },
    { origin: "https://wallerstedt.live", accessKey },
  );

  assert.equal(payload.title, "Ny post");
  assert.equal(payload.action, "create");
  assert.equal(payload.postId, postId);
  assert.match(payload.body, /ICA Maxi Kungsbacka/);
  assert.match(payload.body, /234,50/);
  assert.match(payload.body, /Utbetalning/);
  assert.equal(
    payload.url,
    `https://wallerstedt.live/vault/${accessKey}?post=${postId}`,
  );
});

test("builds distinct Swedish copy for edit and delete", () => {
  const updated = buildPostNotification(
    "update",
    { id: postId, description: "Hyra", amount: "8900", type: "Utbetalning" },
    { origin: "https://wallerstedt.live", accessKey },
  );
  const deleted = buildPostNotification(
    "delete",
    { id: postId, description: "Hyra", amount: "8900", type: "Utbetalning" },
    { origin: "https://wallerstedt.live", accessKey },
  );
  const status = buildPostNotification(
    "status",
    { id: postId, description: "Hyra", amount: "8900", status: "Utkast" },
    { origin: "https://wallerstedt.live", accessKey },
  );

  assert.equal(updated.title, "Ändrad");
  assert.equal(updated.action, "update");
  assert.equal(deleted.title, "Raderad");
  assert.equal(deleted.action, "delete");
  assert.equal(status.title, "Ändrad status");
  assert.match(status.body, /Utkast/);
  assert.equal(updated.url, deleted.url);
  assert.equal(updated.postId, postId);
});

test("summarizes several posts of the same action into one notification", () => {
  const payload = buildPostsNotification(
    "update",
    [
      { id: "a", description: "ICA", amount: "10", type: "Utbetalning" },
      { id: "b", description: "Hyra", amount: "20", type: "Utbetalning" },
    ],
    { origin: "https://wallerstedt.live", accessKey },
  );

  assert.equal(payload?.title, "2 ändrade poster");
  assert.equal(payload?.body, "ICA · Hyra");
  assert.equal(payload?.action, "update");
  assert.equal(payload?.url, `https://wallerstedt.live${vaultPostPath("a", accessKey)}`);
  assert.equal(payload?.postId, "a");
});

test("keeps the create helper as a thin alias with the new title", () => {
  const payload = buildNewPostNotification(
    { id: "post-1", description: "  ", amount: "not-a-number", type: "" },
    { origin: "https://wallerstedt.live", accessKey },
  );
  assert.equal(payload.title, "Ny post");
  assert.equal(payload.body, "En ny post har bokförts.");
  assert.equal(payload.action, "create");
  assert.equal(shortenNotificationBody("A".repeat(140)).endsWith("…"), true);
});

test("reads the post id from a notification URL even when payload fields are sparse", () => {
  assert.equal(
    postIdFromNotificationUrl(`https://wallerstedt.live/vault/${accessKey}?post=${postId}`),
    postId,
  );
  const parsed = parseAccountingPushOpen({
    url: `https://wallerstedt.live/vault/${accessKey}?post=${postId}`,
    action: "delete",
  });
  assert.equal(parsed?.postId, postId);
  assert.equal(parsed?.action, "delete");
  assert.equal(parsed?.title, "Raderad");
  assert.equal(parseAccountingPushOpen({ title: "Ny post" }), null);
});

test("treats a status-only patch as a status change, not a generic edit", () => {
  assert.equal(classifyEntryPatch({ status: "Utkast" }), "status");
  assert.equal(classifyEntryPatch({ status: "Bokförd", updatedAt: new Date() }), "status");
  assert.equal(classifyEntryPatch({ description: "Hyra", status: "Bokförd" }), "update");
  assert.equal(classifyEntryPatch({ amount: "10" }), "update");
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
