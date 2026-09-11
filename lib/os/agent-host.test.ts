import assert from "node:assert/strict";
import test from "node:test";

import { agentHostRewritePath } from "./agent-host";

const key = "secret-accounting-access-key";

test("keeps /<key> and /vault/<key> on the agent workspace", () => {
  assert.equal(agentHostRewritePath(`/${key}`), `/agent/${key}`);
  assert.equal(agentHostRewritePath(`/${key}/`), `/agent/${key}`);
  assert.equal(agentHostRewritePath(`/vault/${key}`), `/agent/${key}`);
  assert.equal(agentHostRewritePath(`/vault/${key}/`), `/agent/${key}`);
});

test("rewrites /<key>/live and /live/<key> to Bolag GPT-Live", () => {
  assert.equal(agentHostRewritePath(`/${key}/live`), `/bolag/${key}/live`);
  assert.equal(agentHostRewritePath(`/${key}/live/`), `/bolag/${key}/live`);
  assert.equal(agentHostRewritePath(`/live/${key}`), `/bolag/${key}/live`);
  assert.equal(agentHostRewritePath(`/live/${key}/`), `/bolag/${key}/live`);
});

test("does not rewrite /agent/, /api/, or /bolag/ paths", () => {
  assert.equal(agentHostRewritePath(`/agent/${key}`), null);
  assert.equal(agentHostRewritePath(`/agent/${key}/inbox`), null);
  assert.equal(agentHostRewritePath(`/api/os/${key}/voice/session`), null);
  assert.equal(agentHostRewritePath(`/bolag/${key}`), null);
  assert.equal(agentHostRewritePath(`/bolag/${key}/live`), null);
  assert.equal(agentHostRewritePath(`/bolag/${key}/money`), null);
});

test("leaves unmatched nested paths alone", () => {
  assert.equal(agentHostRewritePath("/"), null);
  assert.equal(agentHostRewritePath(`/${key}/settings`), null);
  assert.equal(agentHostRewritePath(`/vault/${key}/live`), null);
});
