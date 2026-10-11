import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAccountBalances,
  calculateSelectedAccountBalances,
  centsToMoney,
  vatReportCents,
} from "./balances";

test("account balances mirror debit minus credit for 1930 and 1385", () => {
  const balances = calculateAccountBalances([
    { amount: "1000.00", debitAccount: 1930, creditAccount: 3044, date: "2026-07-01" },
    { amount: "250.25", debitAccount: 6540, creditAccount: 1930, date: "2026-07-02" },
    { amount: "400.10", debitAccount: 1385, creditAccount: 1930, date: "2026-07-03" },
    { amount: "50.05", debitAccount: 1930, creditAccount: 1385, date: "2026-07-04" },
  ]);

  assert.equal(centsToMoney(balances.companyAccountCents), "399.70");
  assert.equal(centsToMoney(balances.capitalInsuranceCents), "350.05");
  assert.equal(balances.asOf, "2026-07-04");
});

test("account balances keep exact cents and ignore unrelated accounts", () => {
  const balances = calculateAccountBalances([
    { amount: 0.1, debitAccount: 1930, creditAccount: 3044, date: new Date("2026-06-01T12:00:00Z") },
    { amount: 0.2, debitAccount: 1930, creditAccount: 3044, date: "invalid" },
    { amount: 999, debitAccount: 5410, creditAccount: 2893, date: null },
  ]);

  assert.equal(centsToMoney(balances.companyAccountCents), "0.30");
  assert.equal(centsToMoney(balances.capitalInsuranceCents), "0.00");
  assert.equal(balances.asOf, "2026-06-01");
});

test("selected balances expose exact debit-minus-credit totals per BAS account", () => {
  const result = calculateSelectedAccountBalances([
    { amount: "1000.10", debitAccount: 1930, creditAccount: 2893, date: "2026-07-01" },
    { amount: "250.05", debitAccount: 1385, creditAccount: 1930, date: "2026-07-02" },
    { amount: "10.00", debitAccount: 2641, creditAccount: 1930, date: "2026-07-03" },
  ], [1930, 2893, 1385]);

  assert.deepEqual(result, {
    balances: [
      { account: 1930, balanceCents: 74005, debitCents: 100010, creditCents: 26005, entryCount: 3 },
      { account: 2893, balanceCents: -100010, debitCents: 0, creditCents: 100010, entryCount: 1 },
      { account: 1385, balanceCents: 25005, debitCents: 25005, creditCents: 0, entryCount: 1 },
    ],
    asOf: "2026-07-03",
  });
});

test("a split VAT purchase posts net to the cost account and the VAT to 2641", () => {
  const entries = [
    {
      amount: "480.10",
      amountExVat: "465.48",
      vatAmount: "14.62",
      vatAccount: 2641,
      debitAccount: 5410,
      creditAccount: 1930,
      date: "2026-09-10",
    },
  ];
  const result = calculateSelectedAccountBalances(entries, [5410, 2641, 1930]);

  assert.deepEqual(result, {
    balances: [
      { account: 5410, balanceCents: 46548, debitCents: 46548, creditCents: 0, entryCount: 1 },
      { account: 2641, balanceCents: 1462, debitCents: 1462, creditCents: 0, entryCount: 1 },
      { account: 1930, balanceCents: -48010, debitCents: 0, creditCents: 48010, entryCount: 1 },
    ],
    asOf: "2026-09-10",
  });
  assert.equal(centsToMoney(calculateAccountBalances(entries).companyAccountCents), "-480.10");
  assert.deepEqual(vatReportCents(entries), {
    outputCents: 0,
    inputCents: 1462,
    payableCents: -1462,
  });
});

test("output VAT is credited to its own account and revenue is booked ex VAT", () => {
  const result = calculateSelectedAccountBalances(
    [
      {
        amount: "30000.00",
        amountExVat: "24000.00",
        vatAmount: "6000.00",
        vatAccount: 2611,
        debitAccount: 1930,
        creditAccount: 3001,
        date: "2026-08-17",
      },
    ],
    [1930, 3001, 2611],
  );

  assert.deepEqual(result.balances, [
    { account: 1930, balanceCents: 3000000, debitCents: 3000000, creditCents: 0, entryCount: 1 },
    { account: 3001, balanceCents: -2400000, debitCents: 0, creditCents: 2400000, entryCount: 1 },
    { account: 2611, balanceCents: -600000, debitCents: 0, creditCents: 600000, entryCount: 1 },
  ]);
});

test("omvänd moms stays on 2645 and 2614 and is not posted a second time", () => {
  const entries = [
    {
      amount: "1000.00",
      debitAccount: 4531,
      creditAccount: 1930,
      date: "2026-07-06",
    },
    {
      amount: "250.00",
      amountExVat: "250.00",
      vatAmount: "0.00",
      vatAccount: null,
      debitAccount: 2645,
      creditAccount: 2614,
      date: "2026-07-06",
    },
  ];
  const result = calculateSelectedAccountBalances(entries, [4531, 1930, 2645, 2614, 2641]);

  assert.deepEqual(result.balances, [
    { account: 4531, balanceCents: 100000, debitCents: 100000, creditCents: 0, entryCount: 1 },
    { account: 1930, balanceCents: -100000, debitCents: 0, creditCents: 100000, entryCount: 1 },
    { account: 2645, balanceCents: 25000, debitCents: 25000, creditCents: 0, entryCount: 1 },
    { account: 2614, balanceCents: -25000, debitCents: 0, creditCents: 25000, entryCount: 1 },
    { account: 2641, balanceCents: 0, debitCents: 0, creditCents: 0, entryCount: 0 },
  ]);
  assert.deepEqual(vatReportCents(entries), {
    outputCents: 25000,
    inputCents: 25000,
    payableCents: 0,
  });
});

test("a VAT split and an omvänd moms entry are summed on each account", () => {
  const entries = [
    {
      amount: "480.10",
      amountExVat: "465.48",
      vatAmount: "14.62",
      vatAccount: 2641,
      debitAccount: 5410,
      creditAccount: 1930,
      date: "2026-09-10",
    },
    {
      amount: "17.41",
      debitAccount: 2645,
      creditAccount: 2614,
      date: "2026-09-10",
    },
  ];
  const result = calculateSelectedAccountBalances(entries, [5410, 2641, 2645, 2614, 1930]);
  const byAccount = new Map(result.balances.map((row) => [row.account, row.balanceCents]));

  assert.equal(byAccount.get(5410), 46548);
  assert.equal(byAccount.get(2641), 1462);
  assert.equal(byAccount.get(2645), 1741);
  assert.equal(byAccount.get(2614), -1741);
  assert.equal(byAccount.get(1930), -48010);
  assert.equal(vatReportCents(entries).payableCents, 1741 - 1462 - 1741);
});
