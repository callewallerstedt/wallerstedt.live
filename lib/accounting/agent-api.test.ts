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

test("stable bank references distinguish genuinely identical payments and account scopes", () => {
  const row = { bankText: "Fee", date: "2026-07-31", amount: "25.00", bankAccountId: "company-a", bankTransactionId: "transaction-1" };
  assert.notEqual(bankRowIdempotencyKey(row), bankRowIdempotencyKey({ ...row, bankTransactionId: "transaction-2" }));
  assert.notEqual(bankRowIdempotencyKey(row), bankRowIdempotencyKey({ ...row, bankAccountId: "company-b" }));
  assert.equal(bankRowIdempotencyKey(row), bankRowIdempotencyKey({ ...row, bankText: "Updated bank description" }));
});
