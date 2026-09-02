import assert from "node:assert/strict";
import test from "node:test";

import { POST as loginBolag } from "../../app/api/bolag/session/route";
import { osPath } from "./paths";
import { configuredOsAccessKey, isOsPageSlug, osPageFromPathname, resolveOsRoute } from "./route";

const key = "secret-accounting-access-key";

test("canonical /bolag uses the configured access key and no page", () => {
  assert.deepEqual(resolveOsRoute(undefined, key), {
    accessKey: key,
    page: "",
    keyedAlias: false,
  });
  assert.deepEqual(resolveOsRoute([], key), {
    accessKey: key,
    page: "",
    keyedAlias: false,
  });
});

test("canonical /bolag/<page> uses the configured access key", () => {
  assert.deepEqual(resolveOsRoute(["money"], key), {
    accessKey: key,
    page: "money",
    keyedAlias: false,
  });
  assert.deepEqual(resolveOsRoute(["accounting"], key), {
    accessKey: key,
    page: "accounting",
    keyedAlias: false,
  });
});

test("/bolag/<key> remains a keyed back-compat alias", () => {
  assert.deepEqual(resolveOsRoute([key], key), {
    accessKey: key,
    page: "",
    keyedAlias: true,
  });
  assert.deepEqual(resolveOsRoute([key, "wealth"], key), {
    accessKey: key,
    page: "wealth",
    keyedAlias: true,
  });
});

test("unknown nested paths are rejected", () => {
  assert.equal(resolveOsRoute(["nope", "nope"], key), null);
  assert.equal(resolveOsRoute(["money", "extra"], key), null);
});

test("osPath never puts the access key in the URL", () => {
  assert.equal(osPath(), "/bolag");
  assert.equal(osPath(""), "/bolag");
  assert.equal(osPath("money"), "/bolag/money");
  assert.equal(osPath("alerts"), "/bolag/alerts");
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

test("sidebar titles follow both canonical and keyed URLs", () => {
  assert.equal(osPageFromPathname("/bolag"), "");
  assert.equal(osPageFromPathname("/bolag/"), "");
  assert.equal(osPageFromPathname("/bolag/money"), "money");
  assert.equal(osPageFromPathname(`/bolag/${key}`), "");
  assert.equal(osPageFromPathname(`/bolag/${key}/alerts`), "alerts");
  assert.equal(osPageFromPathname("/os/upcoming"), "upcoming");
  assert.equal(isOsPageSlug("money"), true);
  assert.equal(isOsPageSlug(key), false);
});

test("keyless bolag login returns 503 when ACCOUNTING_ACCESS_KEY is missing", async () => {
  const previous = process.env.ACCOUNTING_ACCESS_KEY;
  try {
    delete process.env.ACCOUNTING_ACCESS_KEY;
    const response = await loginBolag(
      new Request("https://wallerstedt.live/api/bolag/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://wallerstedt.live",
        },
        body: JSON.stringify({ password: "secret" }),
      }),
    );
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error?: string };
    assert.equal(body.error, "accounting_not_configured");
  } finally {
    if (previous === undefined) delete process.env.ACCOUNTING_ACCESS_KEY;
    else process.env.ACCOUNTING_ACCESS_KEY = previous;
  }
});
