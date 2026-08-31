import assert from "node:assert/strict";
import test from "node:test";

import { bankRowIdempotencyKey } from "./agent-api";

test("bank row fingerprints normalize text and money without losing date identity", () => {
  const first = bankRowIdempotencyKey({
    bankText: "  Juli   ERSÄTTNING  ",
    date: "2026-07-31",
    amount: "1250",
  });
  const retry = bankRowIdempotencyKey({
    bankText: "juli ersättning",
    date: "2026-07-31",
    amount: "1250.00",
  });
  const nextMonth = bankRowIdempotencyKey({
    bankText: "Juli ersättning",
    date: "2026-08-31",
    amount: "1250.00",
  });

  assert.equal(first, retry);
  assert.notEqual(first, nextMonth);
  assert.match(first, /^bank:v1:[a-f0-9]{64}$/);
});
