import assert from "node:assert/strict";
import test from "node:test";

import { osPath } from "./paths";
import { configuredOsAccessKey, isOsPageSlug, osPageFromPathname, resolveOsRoute } from "./route";

const key = "secret-accounting-access-key";

test("bare /bolag and missing keys do not resolve", () => {
  assert.equal(resolveOsRoute(undefined, undefined), null);
  assert.equal(resolveOsRoute("", undefined), null);
  assert.equal(resolveOsRoute("  ", ["money"]), null);
});

test("/bolag/<key> is the canonical dashboard URL", () => {
  assert.deepEqual(resolveOsRoute(key, undefined), {
    accessKey: key,
    page: "",
  });
  assert.deepEqual(resolveOsRoute(key, []), {
    accessKey: key,
    page: "",
  });
});

test("/bolag/<key>/<page> keeps the key in the route", () => {
  assert.deepEqual(resolveOsRoute(key, ["money"]), {
    accessKey: key,
    page: "money",
  });
  assert.deepEqual(resolveOsRoute(key, ["wealth"]), {
    accessKey: key,
    page: "wealth",
  });
  assert.deepEqual(resolveOsRoute(key, ["vault"]), {
    accessKey: key,
    page: "vault",
  });
});

test("page slugs without a key are not valid dashboard routes", () => {
  assert.equal(resolveOsRoute(undefined, ["money"]), null);
  assert.equal(resolveOsRoute("", ["accounting"]), null);
});

test("unknown nested paths are rejected", () => {
  assert.equal(resolveOsRoute(key, ["nope"]), null);
  assert.equal(resolveOsRoute(key, ["money", "extra"]), null);
});

test("osPath keeps the access key in the path like /vault/<key>", () => {
  assert.equal(osPath(key), `/bolag/${key}`);
  assert.equal(osPath(key, ""), `/bolag/${key}`);
  assert.equal(osPath(key, "money"), `/bolag/${key}/money`);
  assert.equal(osPath(key, "alerts"), `/bolag/${key}/alerts`);
  assert.equal(osPath(key, "vault"), `/bolag/${key}/vault`);
});

test("configuredOsAccessKey trims ACCOUNTING_ACCESS_KEY", () => {
  const previous = process.env.ACCOUNTING_ACCESS_KEY;
  try {
    process.env.ACCOUNTING_ACCESS_KEY = "  abc  ";
    assert.equal(configuredOsAccessKey(), "abc");
    delete process.env.ACCOUNTING_ACCESS_KEY;
    assert.equal(configuredOsAccessKey(), "");
  } finally {
    if (previous === undefined) delete process.env.ACCOUNTING_ACCESS_KEY;
    else process.env.ACCOUNTING_ACCESS_KEY = previous;
  }
});

test("sidebar titles read the page after the access key", () => {
  assert.equal(osPageFromPathname("/bolag"), "");
  assert.equal(osPageFromPathname("/bolag/"), "");
  assert.equal(osPageFromPathname("/bolag/money"), "");
  assert.equal(osPageFromPathname(`/bolag/${key}`), "");
  assert.equal(osPageFromPathname(`/bolag/${key}/alerts`), "alerts");
  assert.equal(osPageFromPathname(`/bolag/${key}/vault`), "vault");
  assert.equal(osPageFromPathname(`/os/${key}/upcoming`), "upcoming");
  assert.equal(isOsPageSlug("money"), true);
  assert.equal(isOsPageSlug(key), false);
});
