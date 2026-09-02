import assert from "node:assert/strict";
import test from "node:test";

import { buildLedgerSnapshot, entryKind } from "./ledger";
import { lastNMonths, moneyToCents } from "./format";
import { quarterlyVatDeadlines, nextMonthlyTaxDate } from "./calendar";
import { buildAlerts } from "./alerts";

test("entry kinds follow the Swedish ledger types", () => {
  assert.equal(entryKind("Inbetalning"), "income");
  assert.equal(entryKind("Utbetalning"), "expense");
  assert.equal(entryKind("Skuld"), "debt");
  assert.equal(entryKind("Omföring"), "other");
});

test("month windows are calendar months, not invented totals", () => {
  assert.deepEqual(lastNMonths("2026-09-02", 3), ["2026-07", "2026-08", "2026-09"]);
  assert.equal(moneyToCents("12.34"), 1234);
});

test("ledger snapshot uses booked posts only and labels missing receipts", () => {
  const snapshot = buildLedgerSnapshot(
    [
      {
        id: "in-1",
        date: "2026-09-01",
        description: "Spotify",
        debitAccount: 1930,
        creditAccount: 3044,
        debitName: "Företagskonto",
        creditName: "Royalty",
        amount: "1000.00",
        vatAmount: "0",
        type: "Inbetalning",
        receiptRequired: false,
        documentCount: 0,
      },
      {
        id: "out-1",
        date: "2026-09-02",
        description: "Adobe Creative Cloud",
        debitAccount: 6540,
        creditAccount: 1930,
        debitName: "Programvara",
        creditName: "Företagskonto",
        amount: "200.00",
        vatAmount: "40.00",
        type: "Utbetalning",
        receiptRequired: true,
        documentCount: 0,
      },
      {
        id: "out-2",
        date: "2026-08-02",
        description: "Adobe Creative Cloud",
        debitAccount: 6540,
        creditAccount: 1930,
        debitName: "Programvara",
        creditName: "Företagskonto",
        amount: "200.00",
        vatAmount: "40.00",
        type: "Utbetalning",
        receiptRequired: true,
        documentCount: 1,
      },
      {
        id: "kf",
        date: "2026-07-01",
        description: "Insättning KF",
        debitAccount: 1385,
        creditAccount: 1930,
        debitName: "KF",
        creditName: "Företagskonto",
        amount: "500.00",
        vatAmount: "0",
        type: "Omföring",
        receiptRequired: false,
        documentCount: 0,
      },
    ],
    [
      { account: 1930, name: "Företagskonto" },
      { account: 1385, name: "Kapitalförsäkring" },
      { account: 6540, name: "Programvara" },
    ],
    2,
    "2026-09-02",
  );

  assert.equal(snapshot.incomeMonthCents, 100000);
  assert.equal(snapshot.expenseMonthCents, 20000);
  assert.equal(snapshot.profitYtdCents, 60000);
  assert.equal(snapshot.afterTaxYtdCents, 60000 - Math.round(60000 * 0.206));
  assert.equal(snapshot.expenses.length, 2);
  assert.equal(snapshot.bankCents, 10000);
  assert.equal(snapshot.kfDepositedCents, 50000);
  assert.equal(snapshot.ledgerAssetsCents, 60000);
  assert.equal(snapshot.missingReceiptCount, 1);
  assert.equal(snapshot.softwareCents, 40000);
  assert.equal(snapshot.recurring[0]?.months, 2);
  assert.equal(snapshot.pendingDraftCount, 2);
  assert.equal(snapshot.employerCents, null);
  assert.equal(snapshot.taxAccountCents, null);
});

test("VAT calendar stays on the 12th and does not invent amounts", () => {
  const deadlines = quarterlyVatDeadlines(2026);
  assert.equal(deadlines[1]?.date, "2026-05-12");
  assert.equal(nextMonthlyTaxDate("2026-09-02"), "2026-09-12");
  assert.equal(nextMonthlyTaxDate("2026-09-12"), "2026-10-12");
});

test("alerts only fire from real ledger or repo signals", () => {
  const alerts = buildAlerts({
    nowYmd: "2026-09-02",
    vaultBase: "/vault/key",
    upcoming: [
      {
        id: "vat",
        title: "VAT Q3 2026",
        date: "2026-09-12",
        kind: "tax",
        detail: "Standard quarterly VAT calendar — not confirmed from Skatteverket",
      },
    ],
    projects: [
      {
        name: "design",
        status: "active",
        currentTask: null,
        nextAction: null,
        repo: "callewallerstedt/design",
        repoUrl: "https://github.com/callewallerstedt/design",
        website: null,
        revenueCents: null,
        costCents: null,
        hours: null,
        notes: null,
        lastActivity: "2026-08-01T00:00:00.000Z",
        kind: "site",
      },
    ],
    ledger: {
      asOf: "2026-09-02",
      generatedOn: "2026-09-02",
      year: "2026",
      month: "2026-09",
      incomeMonthCents: 0,
      incomeYtdCents: 0,
      expenseMonthCents: 0,
      expenseYtdCents: 0,
      profitMonthCents: 0,
      profitYtdCents: 0,
      vatPayableCents: 0,
      vatYtdCents: 0,
      debtCents: 0,
      bankCents: -100,
      kfDepositedCents: 0,
      ledgerAssetsCents: -100,
      taxAccountCents: null,
      employerCents: null,
      withholdingCents: null,
      corpTaxBookedCents: null,
      corpTaxEstimateCents: 0,
      cashAfterTaxCents: -100,
      afterTaxYtdCents: 0,
      missingReceiptCount: 3,
      pendingDraftCount: 1,
      entryCount: 3,
      months: [],
      recent: [],
      missingReceipts: [],
      largestExpenses: [],
      categories: [],
      softwareCents: 0,
      hardwareCents: 0,
      adsCents: 0,
      accountingCents: 0,
      recurring: [],
      counterparties: [],
      expenses: [],
      accountNames: {},
    },
  });

  assert.ok(alerts.some((alert) => alert.id === "receipts-missing"));
  assert.ok(alerts.some((alert) => alert.id === "bank-negative"));
  assert.ok(alerts.some((alert) => alert.id === "stale-callewallerstedt/design"));
  assert.ok(alerts.some((alert) => alert.title === "VAT approaching"));
  assert.ok(!alerts.some((alert) => /spotify down/i.test(alert.title)));
});

test("negative Utbetalning amounts count as expenses, like the vault", () => {
  const snapshot = buildLedgerSnapshot(
    [
      {
        id: "in-1",
        date: "2026-09-01",
        description: "Royalty",
        debitAccount: 1930,
        creditAccount: 3044,
        debitName: "Företagskonto",
        creditName: "Royalty",
        amount: "1000.00",
        vatAmount: "0",
        type: "Inbetalning",
        receiptRequired: false,
        documentCount: 0,
      },
      {
        id: "out-neg",
        date: "2026-09-02",
        description: "Adobe Creative Cloud",
        debitAccount: 6540,
        creditAccount: 1930,
        debitName: "Programvara",
        creditName: "Företagskonto",
        amount: "-200.00",
        vatAmount: "-40.00",
        type: "Utbetalning",
        receiptRequired: true,
        documentCount: 1,
      },
    ],
    [
      { account: 1930, name: "Företagskonto" },
      { account: 6540, name: "Programvara" },
    ],
    0,
    "2026-09-02",
  );

  assert.equal(snapshot.expenseMonthCents, 20000);
  assert.equal(snapshot.expenseYtdCents, 20000);
  assert.equal(snapshot.profitYtdCents, 80000);
  assert.equal(snapshot.vatPayableCents, -4000);
  assert.equal(snapshot.softwareCents, 20000);
});
