import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAccountBalances,
  calculateSelectedAccountBalances,
  centsToMoney,
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
