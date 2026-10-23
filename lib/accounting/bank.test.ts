import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { listAspsps, startAuthorization, getTransactions } from "../finance/enable-banking";
import { GET as bankStatus, POST as connectBank, DELETE as disconnectBank } from "../../app/api/accounting/[accessKey]/agent/v1/bank/route";
import { GET as bankBalances } from "../../app/api/accounting/[accessKey]/agent/v1/bank/accounts/[id]/balances/route";
import { GET as bankTransactions } from "../../app/api/accounting/[accessKey]/agent/v1/bank/accounts/[id]/transactions/route";

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
