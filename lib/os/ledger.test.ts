import assert from "node:assert/strict";
import test from "node:test";

import { buildLedgerSnapshot, entryKind } from "./ledger";
import { lastNMonths, moneyToCents, monthEndYmd } from "./format";
import { quarterlyVatDeadlines, nextMonthlyTaxDate } from "./calendar";
import { buildActions } from "./actions";

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
  assert.equal(snapshot.lastMonth, "2026-08");
  assert.equal(snapshot.incomeLastMonthCents, 0);
  assert.equal(snapshot.expenseLastMonthCents, 20000);
  assert.equal(snapshot.profitLastMonthCents, -20000);
  assert.equal(snapshot.profitYtdCents, 60000);
  assert.equal(snapshot.afterTaxYtdCents, 60000 - Math.round(60000 * 0.206));
  assert.equal(snapshot.expenses.length, 2);
  assert.equal(snapshot.bankCents, 10000);
  assert.equal(snapshot.kfDepositedCents, 50000);
  const july = snapshot.months.find((row) => row.month === "2026-07");
  const august = snapshot.months.find((row) => row.month === "2026-08");
  const september = snapshot.months.find((row) => row.month === "2026-09");
  assert.equal(july?.bankCents, -50000);
  assert.equal(july?.kfCents, 50000);
  assert.equal(august?.bankCents, -70000);
  assert.equal(september?.bankCents, 10000);
  assert.equal(monthEndYmd("2026-09"), "2026-09-30");
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

test("actions only fire from real ledger or repo signals", () => {
  const actions = buildActions({
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
    ledger: {
      asOf: "2026-09-02",
      generatedOn: "2026-09-02",
      year: "2026",
      month: "2026-09",
      incomeMonthCents: 0,
      incomeLastMonthCents: 0,
      incomeYtdCents: 0,
      expenseMonthCents: 0,
      expenseLastMonthCents: 0,
      expenseYtdCents: 0,
      profitMonthCents: 0,
      profitLastMonthCents: 0,
      profitYtdCents: 0,
      lastMonth: "2026-08",
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

  assert.ok(actions.some((action) => action.id === "receipts"));
  assert.ok(actions.some((action) => action.id === "drafts"));
  assert.ok(actions.some((action) => action.id === "bank-negative"));
  assert.ok(actions.some((action) => action.id === "tax-vat"));
  assert.ok(!actions.some((action) => /spotify/i.test(action.title)));
  // Urgent money problems sort above the merely upcoming.
  assert.ok(
    actions.findIndex((action) => action.id === "receipts") <
      actions.findIndex((action) => action.id === "tax-vat"),
  );
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

test("spotify history is the S4A scrape, not invented stream counts", async () => {
  const { loadSpotifyHistory } = await import("./spotify-history");
  const history = loadSpotifyHistory();
  assert.equal(history.source, "callewallerstedt/spotifyanalytics");
  assert.equal(history.scrapedAt, "2026-04-15");
  assert.equal(history.throughLabel, "through Apr 2026");
  assert.equal(history.from, "2025-04-14");
  assert.equal(history.to, "2026-04-14");
  assert.equal(history.totalStreams, 21630138);
  assert.equal(history.ownStreams, 10815255);
  assert.equal(history.labelStreams, 10814883);
  assert.equal(history.lastCompleteOwn, 38427);
  assert.equal(history.memories.name, "Memories");
  assert.equal(history.memories.firstDayStreams, 16236);
  assert.equal(history.memories.streams, 6177931);
  assert.equal(history.ratePerStreamUsd, 0.00294);
  assert.equal(history.estimatedOwnEarningsUsd, 31796.85);
  assert.equal(history.distrokid.spotifyQty, 23845399);
  assert.equal(history.distrokid.spotifyEarnUsd, 40021.17);
  assert.equal(history.csvVerified.days, 364);
  assert.equal(history.csvVerified.ownTotal, 10654264);
  assert.equal(history.csvVerified.ownLastDay, 32702);
  assert.equal(
    history.daily.reduce((sum, row) => sum + row.own + row.label, 0),
    history.totalStreams,
  );
  assert.equal(
    history.months.reduce((sum, row) => sum + row.total, 0),
    history.totalStreams,
  );
});
