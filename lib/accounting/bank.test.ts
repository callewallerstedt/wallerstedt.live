import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { listAspsps, startAuthorization, getTransactions } from "../finance/enable-banking";
import { GET as bankStatus, POST as connectBank, DELETE as disconnectBank } from "../../app/api/accounting/[accessKey]/agent/v1/bank/route";
import { GET as bankBalances } from "../../app/api/accounting/[accessKey]/agent/v1/bank/accounts/[id]/balances/route";
import { GET as bankTransactions } from "../../app/api/accounting/[accessKey]/agent/v1/bank/accounts/[id]/transactions/route";
import { completeBusinessBankConnection, completionDiagnostic } from "./bank";
import { EnableBankingError } from "../finance/enable-banking";
import type { PrismaClient } from "@prisma/client";

process.env.ACCOUNTING_ACCESS_KEY = "test-access";
process.env.ACCOUNTING_PASSWORD = "test-password";
process.env.ACCOUNTING_SESSION_SECRET = "s".repeat(48);
process.env.ACCOUNTING_AGENT_API_TOKEN = "t".repeat(48);
const params = { params: Promise.resolve({ accessKey: "test-access", id: "not-a-company-account" }) };

test("all business-bank entry points reject unauthenticated access before database/provider work", async () => {
  for (const [method, handler] of [["GET", bankStatus], ["POST", connectBank], ["DELETE", disconnectBank], ["GET", bankBalances], ["GET", bankTransactions]] as const) {
    const response = await handler(new Request("https://example.test/api", { method }), params);
    assert.equal(response.status, 401);
  }
});

test("business discovery and authorization use business PSU, personal flow remains personal", async () => {
  const original = global.fetch;
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.ENABLE_BANKING_APP_ID = "test-app";
  process.env.ENABLE_BANKING_PRIVATE_KEY = key;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  global.fetch = (async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return Response.json({ aspsps: [], url: "https://bank.example.test/consent" });
  }) as typeof fetch;
  try {
    await listAspsps("SE", "business");
    assert.ok(calls[0].url.includes("psu_type=business"));
    const input = { aspspName: "Handelsbanken", aspspCountry: "SE", state: "state", redirectUrl: "https://example.test/callback", validUntil: new Date("2026-12-01") };
    await startAuthorization({ ...input, psuType: "business" });
    await startAuthorization(input);
    assert.equal(calls[1].body.psu_type, "business");
    assert.equal(calls[2].body.psu_type, "personal");
  } finally { global.fetch = original; }
});

test("bank pagination cannot silently truncate repeated cursors and honors dateTo", async () => {
  const original = global.fetch;
  let count = 0;
  global.fetch = (async (url) => {
    assert.ok(String(url).includes("date_to=2026-07-31")); count++;
    return Response.json({ transactions: [], continuation_key: "repeated" });
  }) as typeof fetch;
  try {
    await assert.rejects(() => getTransactions("account", "2026-07-01", undefined, "2026-07-31"), (error: unknown) => (error as { code: string }).code === "bank_pagination_incomplete");
    assert.equal(count, 2);
  } finally { global.fetch = original; }
});

function completionFixture() {
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  const state = { id: "hash", bank: "Handelsbanken", country: "SE", expiresAt: new Date(Date.now() + 60_000), status: "pending", errorCode: null, errorStage: null, session: null, connectionId: null };
  const providerSession = { session_id: "session", psu_type: "business", aspsp: { name: "Handelsbanken", country: "SE" }, access: { valid_until: new Date(Date.now() + 86_400_000).toISOString() }, accounts: [{ uid: "company-only", currency: "SEK" }] };
  let saved: Record<string, unknown> | null = null;
  let failSave = false;
  const client = {
    accountingBankAuthState: {
      findUnique: async () => ({ ...state }),
      updateMany: async ({ where, data }: { where: { status?: string }; data: object }) => {
        if (where.status && where.status !== state.status) return { count: 0 };
        Object.assign(state, data); return { count: 1 };
      },
      update: async ({ data }: { data: object }) => { Object.assign(state, data); return state; },
    },
    accountingBankConnection: {
      findUnique: async () => saved,
      findMany: async () => saved ? [saved] : [],
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        if (failSave) throw new Error("simulated database failure");
        saved = { ...create, status: "active" }; return saved;
      },
    },
    $transaction: async (work: (client: unknown) => Promise<unknown>) => work(client),
  };
  const previous = global.__accountingPrisma;
  global.__accountingPrisma = client as unknown as PrismaClient;
  return { state, providerSession, failPersistence: (value: boolean) => { failSave = value; }, restore: () => { global.__accountingPrisma = previous; } };
}

test("successful callback persists before completion and repeated callbacks do not exchange twice", async () => {
  const fixture = completionFixture(), originalFetch = global.fetch;
  let exchanges = 0;
  global.fetch = (async () => { exchanges++; return Response.json(fixture.providerSession); }) as typeof fetch;
  try {
    const state = `company.${"a".repeat(43)}`;
    assert.equal((await completeBusinessBankConnection("code", state)).accounts, 1);
    assert.equal(fixture.state.status, "completed");
    assert.equal((await completeBusinessBankConnection("code", state)).accounts, 1);
    assert.equal(exchanges, 1);
  } finally { global.fetch = originalFetch; fixture.restore(); }
});

test("failed persistence retains exchanged consent and can finish without repeating BankID or exchanging the code", async () => {
  const fixture = completionFixture(), originalFetch = global.fetch;
  let exchanges = 0;
  global.fetch = (async () => { exchanges++; return Response.json(fixture.providerSession); }) as typeof fetch;
  try {
    fixture.failPersistence(true);
    const state = `company.${"b".repeat(43)}`;
    await assert.rejects(() => completeBusinessBankConnection("code", state));
    assert.equal(fixture.state.status, "failed");
    assert.equal(fixture.state.errorStage, "persist");
    assert.ok(fixture.state.session);
    fixture.failPersistence(false);
    assert.equal((await completeBusinessBankConnection("code", state)).accounts, 1);
    assert.equal(exchanges, 1);
  } finally { global.fetch = originalFetch; fixture.restore(); }
});

test("provider denial retains its safe diagnostic and never logs or returns upstream secrets", async () => {
  const fixture = completionFixture(), originalFetch = global.fetch;
  global.fetch = (async () => Response.json({ error: "ACCESS_DENIED", message: "sensitive upstream content" }, { status: 403 })) as typeof fetch;
  try {
    await assert.rejects(() => completeBusinessBankConnection("code", `company.${"c".repeat(43)}`), (error: unknown) => {
      const details = (error as { details: object }).details;
      assert.deepEqual(details, { stage: "exchange", reason: "ACCESS_DENIED", bankStatus: 403 });
      assert.ok(!JSON.stringify(details).includes("sensitive")); return true;
    });
    assert.equal(fixture.state.status, "failed");
    assert.equal(fixture.state.errorCode, "ACCESS_DENIED");
    assert.deepEqual(completionDiagnostic(new EnableBankingError("secret", 403, "invalid\nvalue")), { stage: "callback", reason: "upstream_error", bankStatus: 403 });
  } finally { global.fetch = originalFetch; fixture.restore(); }
});

test("a private consent is never accepted into company storage", async () => {
  const fixture = completionFixture(), originalFetch = global.fetch;
  global.fetch = (async (_url, init) => init?.method === "DELETE" ? Response.json({ message: "OK" }) : Response.json({ ...fixture.providerSession, psu_type: "personal" })) as typeof fetch;
  try {
    await assert.rejects(() => completeBusinessBankConnection("code", `company.${"d".repeat(43)}`));
    assert.equal(fixture.state.errorCode, "business_type_mismatch");
    assert.equal(fixture.state.connectionId, null);
  } finally { global.fetch = originalFetch; fixture.restore(); }
});
