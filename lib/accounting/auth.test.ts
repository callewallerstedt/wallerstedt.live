import assert from "node:assert/strict";
import test from "node:test";
import { POST as createAccount } from "../../app/api/accounting/[accessKey]/accounts/route";
import { GET as getDashboard } from "../../app/api/accounting/[accessKey]/dashboard/route";
import {
  DELETE as deleteSession,
  GET as getSession,
} from "../../app/api/accounting/[accessKey]/session/route";
import {
  currentSessionRevocationMutation,
  ownerSessionRecordIsActive,
  sessionRecordId,
} from "./auth";

const accessKey = "test-accounting-access-key";
const origin = "https://accounting.example.test";
const params = { params: Promise.resolve({ accessKey }) };

process.env.ACCOUNTING_ACCESS_KEY = accessKey;
process.env.ACCOUNTING_PASSWORD = "test-password-long-enough";
process.env.ACCOUNTING_SESSION_SECRET = "s".repeat(48);

test("session record IDs are deterministic hashes, never the raw nonce", () => {
  const nonce = "example-session-nonce-123456";
  const id = sessionRecordId(nonce);

  assert.notEqual(id, nonce);
  assert.equal(id, sessionRecordId(nonce));
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
});

test("revoked or expired session records are inactive", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");
  const tokenExpiry = Math.floor(now.getTime() / 1_000) + 60;

  assert.equal(
    ownerSessionRecordIsActive(
      { expiresAt: new Date(now.getTime() + 60_000), revokedAt: null },
      tokenExpiry,
      now,
    ),
    true,
  );
  assert.equal(
    ownerSessionRecordIsActive(
      { expiresAt: new Date(now.getTime() + 60_000), revokedAt: now },
      tokenExpiry,
      now,
    ),
    false,
  );
  assert.equal(
    ownerSessionRecordIsActive(
      { expiresAt: new Date(now.getTime() - 1), revokedAt: null },
      tokenExpiry,
      now,
    ),
    false,
  );
});

test("logout revocation targets only the current hashed session", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");
  const id = sessionRecordId("current-session-nonce-123456");

  assert.deepEqual(currentSessionRevocationMutation(id, now), {
    where: { id, revokedAt: null },
    data: { revokedAt: now, lastUsedAt: now },
  });
});

test("session status is unauthenticated when the cookie is absent", async () => {
  const response = await getSession(
    new Request(`${origin}/api/accounting/${accessKey}/session`),
    params,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, authenticated: false });
});

test("read and mutation routes reject a missing owner session", async () => {
  const dashboard = await getDashboard(
    new Request(`${origin}/api/accounting/${accessKey}/dashboard`),
    params,
  );
  assert.equal(dashboard.status, 401);
  assert.equal((await dashboard.json()).error, "unauthorized");

  const account = await createAccount(
    new Request(`${origin}/api/accounting/${accessKey}/accounts`, {
      method: "POST",
      headers: { origin },
    }),
    params,
  );
  assert.equal(account.status, 401);
  assert.equal((await account.json()).error, "unauthorized");
});

test("logout cannot clear server-side state without an owner session", async () => {
  const response = await deleteSession(
    new Request(`${origin}/api/accounting/${accessKey}/session`, {
      method: "DELETE",
      headers: { origin },
    }),
    params,
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});
