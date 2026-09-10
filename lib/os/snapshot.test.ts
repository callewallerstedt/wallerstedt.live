import assert from "node:assert/strict";
import test from "node:test";

import { osSnapshotKind, publishLedger } from "./snapshot-shape";
import type { LedgerSnapshot } from "./types";

function ledger(partial: Partial<LedgerSnapshot> = {}): LedgerSnapshot {
  return {
    asOf: "2026-09-10",
    generatedOn: "2026-09-10",
    year: "2026",
    month: "2026-09",
    incomeMonthCents: 1,
    incomeLastMonthCents: 0,
    incomeYtdCents: 1,
    expenseMonthCents: 0,
    expenseLastMonthCents: 0,
    expenseYtdCents: 0,
    profitMonthCents: 1,
    profitLastMonthCents: 0,
    profitYtdCents: 1,
    lastMonth: "2026-08",
    vatPayableCents: 0,
    vatYtdCents: 0,
    debtCents: 0,
    bankCents: 100,
    kfDepositedCents: 0,
    ledgerAssetsCents: 100,
    taxAccountCents: null,
    employerCents: null,
    withholdingCents: null,
    corpTaxBookedCents: null,
    corpTaxEstimateCents: 0,
    cashAfterTaxCents: 100,
    afterTaxYtdCents: 1,
    missingReceiptCount: 2,
    pendingDraftCount: 0,
    entryCount: 3,
    months: [],
    cumulative: [],
    recent: [
      {
        id: "a",
        date: "2026-09-01",
        description: "One",
        debitAccount: 1930,
        creditAccount: 3000,
        debitName: null,
        creditName: null,
        amountCents: 100,
        vatCents: 0,
        type: "Inbetalning",
        kind: "income",
        receiptRequired: false,
        documentCount: 0,
        missingReceipt: false,
      },
    ],
    missingReceipts: [
      {
        id: "b",
        date: "2026-09-02",
        description: "Missing",
        debitAccount: 6540,
        creditAccount: 1930,
        debitName: null,
        creditName: null,
        amountCents: 50,
        vatCents: 0,
        type: "Utbetalning",
        kind: "expense",
        receiptRequired: true,
        documentCount: 0,
        missingReceipt: true,
      },
    ],
    largestExpenses: [],
    categories: [{ key: "6540", label: "6540 Software", account: 6540, cents: 50, count: 1 }],
    softwareCents: 50,
    hardwareCents: 0,
    adsCents: 0,
    accountingCents: 0,
    recurring: [],
    counterparties: [],
    expenses: [
      {
        id: "b",
        date: "2026-09-02",
        description: "Missing",
        debitAccount: 6540,
        creditAccount: 1930,
        debitName: null,
        creditName: null,
        amountCents: 50,
        vatCents: 0,
        type: "Utbetalning",
        kind: "expense",
        receiptRequired: true,
        documentCount: 0,
        missingReceipt: true,
      },
    ],
    accountNames: { 6540: "IT" },
    ...partial,
  };
}

test("each tab asks only for the data it paints", () => {
  assert.equal(osSnapshotKind(""), "overview");
  assert.equal(osSnapshotKind("tasks"), "tasks");
  assert.equal(osSnapshotKind("tiktok"), "tiktok");
  assert.equal(osSnapshotKind("money"), "money");
  assert.equal(osSnapshotKind("music"), "music");
  assert.equal(osSnapshotKind("settings"), "settings");
  assert.equal(osSnapshotKind("vault"), "vault");
});

test("overview payload drops money-only ledger lists", () => {
  const published = publishLedger(ledger(), "overview");
  assert.deepEqual(published.expenses, []);
  assert.deepEqual(published.accountNames, {});
  assert.deepEqual(published.categories, []);
  assert.deepEqual(published.missingReceipts, []);
  assert.equal(published.missingReceiptCount, 2);
  assert.equal(published.bankCents, 100);
  assert.equal(published.recent.length, 1);
});

test("money payload keeps category lists but not the raw expense dump", () => {
  const published = publishLedger(ledger(), "money");
  assert.deepEqual(published.expenses, []);
  assert.deepEqual(published.accountNames, {});
  assert.equal(published.categories.length, 1);
  assert.equal(published.missingReceipts.length, 1);
});
