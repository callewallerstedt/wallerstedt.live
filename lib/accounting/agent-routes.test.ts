import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { accountingOpenApi } from "./agent-contract";
import { GET as reports } from "../../app/api/accounting/[accessKey]/agent/v1/reports/route";
import { POST as reconcile } from "../../app/api/accounting/[accessKey]/agent/v1/reconcile/route";
import { GET as attachments } from "../../app/api/accounting/[accessKey]/agent/v1/attachments/route";
import { GET as download } from "../../app/api/accounting/[accessKey]/agent/v1/attachments/[id]/download/route";
import { PATCH as assign, DELETE as deleteDocument } from "../../app/api/accounting/[accessKey]/agent/v1/attachments/[id]/route";
import { GET as accounts, POST as createAccount } from "../../app/api/accounting/[accessKey]/agent/v1/accounts/route";
import { PATCH as updateAccount, DELETE as deleteAccount } from "../../app/api/accounting/[accessKey]/agent/v1/accounts/[id]/route";
import { GET as changes } from "../../app/api/accounting/[accessKey]/agent/v1/changes/route";
import { GET as revisions } from "../../app/api/accounting/[accessKey]/agent/v1/entries/[id]/revisions/route";
import { DELETE as deleteEntry } from "../../app/api/accounting/[accessKey]/agent/v1/entries/[id]/route";
import { GET as openapi } from "../../app/api/accounting/[accessKey]/agent/v1/openapi/route";
import { GET as guide } from "../../app/api/accounting/[accessKey]/agent/v1/guide/route";

process.env.ACCOUNTING_ACCESS_KEY = "route-test-access";
process.env.ACCOUNTING_PASSWORD = "test-password";
process.env.ACCOUNTING_SESSION_SECRET = "s".repeat(48);
process.env.ACCOUNTING_AGENT_API_TOKEN = "t".repeat(48);
const params = { params: Promise.resolve({ accessKey: "route-test-access", id: "11111111-1111-4111-8111-111111111111" }) };

test("every new accounting tool authenticates before reading records, bytes or mutation input", async () => {
  for (const [method, handler] of [["GET", reports], ["POST", reconcile], ["GET", attachments], ["GET", download], ["PATCH", assign], ["DELETE", deleteDocument], ["GET", accounts], ["POST", createAccount], ["PATCH", updateAccount], ["DELETE", deleteAccount], ["GET", changes], ["GET", revisions], ["DELETE", deleteEntry], ["GET", openapi], ["GET", guide]] as const) {
    const response = await handler(new Request("https://example.test/api", { method }), params);
    assert.equal(response.status, 401, `${method} ${handler.name}`);
  }
});

test("dedicated bearer access returns machine-readable contracts and downloadable guide with private cache headers", async () => {
  const request = new Request("https://example.test/api", { headers: { Authorization: `Bearer ${process.env.ACCOUNTING_AGENT_API_TOKEN}` } });
  const response = await openapi(request, params);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const contract = await response.json();
  assert.equal(contract.openapi, "3.1.0");
  assert.ok(contract.paths["/reports"].get.operationId);
  assert.ok(!JSON.stringify(contract).includes(process.env.ACCOUNTING_AGENT_API_TOKEN!));
  const guideResponse = await guide(request, params);
  assert.equal(guideResponse.status, 200);
  assert.match(guideResponse.headers.get("content-type")!, /text\/markdown/);
  assert.match(await guideResponse.text(), /Grokbot/);
});

test("OpenAPI describes every implemented v1 route and HTTP method with unique operation IDs", async () => {
  const root = path.join(process.cwd(), "app/api/accounting/[accessKey]/agent/v1");
  const contract = accountingOpenApi("/api/accounting/example/agent/v1");
  const paths = contract.paths as Record<string, Record<string, unknown>>;
  const ids = new Set<string>();
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (entry.name !== "route.ts") continue;
      const relative = path.relative(root, directory).replace(/\\/g, "/").replace(/\[([^\]]+)\]/g, "{$1}");
      const key = relative ? "/" + relative : "/";
      const code = await readFile(file, "utf8");
      for (const match of code.matchAll(/export async function (GET|POST|PATCH|DELETE)\(/g)) {
        const operation = paths[key]?.[match[1].toLowerCase()] as { operationId?: string } | undefined;
        assert.ok(operation?.operationId, `${key} ${match[1]} missing from contract`);
        assert.ok(!ids.has(operation.operationId), `Repeated operation ID: ${operation.operationId}`);
        ids.add(operation.operationId);
      }
    }
  }
  await visit(root);
});
