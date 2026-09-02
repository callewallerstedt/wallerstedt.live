import assert from "node:assert/strict";
import test from "node:test";

import { matchProjectLedger } from "./projects";
import type { LedgerEntryRow } from "./types";

function expense(id: string, description: string, amountCents: number): LedgerEntryRow {
  return {
    id,
    date: "2026-01-15",
    description,
    debitAccount: 6540,
    creditAccount: 1930,
    debitName: "Programvara",
    creditName: "Företagskonto",
    amountCents,
    vatCents: 0,
    type: "Utbetalning",
    kind: "expense",
    receiptRequired: true,
    documentCount: 1,
    missingReceipt: false,
  };
}

test("project costs use each ledger expense once, including rows outside recent/largest slices", () => {
  const duplicate = expense("design-adobe", "Adobe for design kit", 10000);
  const older = expense("design-host", "design hosting", 2500);
  const money = matchProjectLedger("design", {
    counterparties: [],
    expenses: [duplicate, duplicate, older],
  });

  assert.equal(money.costCents, 12500);
  assert.equal(money.revenueCents, 0);
});

test("project costs stay empty when no expense mentions the repo", () => {
  const money = matchProjectLedger("design", {
    counterparties: [],
    expenses: [expense("other", "Adobe Creative Cloud", 20000)],
  });
  assert.equal(money.costCents, null);
  assert.equal(money.revenueCents, null);
});
