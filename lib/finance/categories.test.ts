import assert from "node:assert/strict";
import { test } from "node:test";

import { categorize, findTransferPairs, normalizeMerchant } from "./categories";
import { buildSavingsTips, suggestBudgets } from "./tips";

test("sorts common Swedish bank lines", () => {
  const cases: Array<[string, number, string]> = [
    ["KORTKÖP 260917 ICA NARA TORGET", -24_500, "groceries"],
    ["Kortköp MAX BURGERS KUNGSBACKA", -12_900, "fastfood"],
    ["FOODORA AB", -21_000, "fastfood"],
    ["UBER EATS", -18_000, "fastfood"],
    ["UBER TRIP", -9_000, "transport"],
    ["CIRCLE K KUNGSBACKA", -60_000, "car"],
    ["EASYPARK", -3_000, "car"],
    ["SPOTIFY P1234", -11_900, "subscriptions"],
    ["Swish betalning Anna", -20_000, "swish"],
    ["Överföring eget konto", -500_000, "transfer"],
    ["AVANZA BANK", -100_000, "savings"],
    ["Uttag Bankomat", -50_000, "cash"],
    ["THOMANN", -250_000, "hobbies"],
    ["TRÄNGSELSKATT", -2_200, "car"],
    ["SOMETHING UNKNOWN", -5_000, "other"],
    ["LÖN WALLERSTEDT PRODUCTIONS AB", 2_500_000, "income"],
    ["Överföring från sparkonto", 300_000, "transfer"],
    ["ICA refund", 5_000, "groceries"],
  ];
  for (const [text, amountCents, expected] of cases) {
    assert.equal(categorize({ text, amountCents }), expected, text);
  }
});

test("merchant keys drop dates, amounts and card noise", () => {
  assert.equal(normalizeMerchant("KORTKÖP 260917 ICA NARA TORGET KUNGSB"), "ICA NARA TORGET");
  assert.equal(normalizeMerchant("Reservation Kortköp MAX BURGERS 129,00 SEK"), "MAX BURGERS");
  assert.equal(normalizeMerchant("KORTKÖP 260901 ICA NARA TORGET"), normalizeMerchant("KORTKÖP 260918 ICA NARA TORGET"));
});

test("pairs own transfers across accounts only", () => {
  const pairs = findTransferPairs([
    { id: "a", accountId: "1", amountCents: -100_000, day: 10 },
    { id: "b", accountId: "2", amountCents: 100_000, day: 11 },
    { id: "c", accountId: "1", amountCents: -5_000, day: 10 },
    { id: "d", accountId: "1", amountCents: 5_000, day: 10 },
  ]);
  assert.deepEqual([...pairs].sort(), ["a", "b"]);
});

test("tips are ranked by yearly effect and suggest budgets under the average", () => {
  const tips = buildSavingsTips({
    bankCents: 20_000_000,
    month: { isCurrent: true, incomeCents: 3_000_000, spendingCents: 1_500_000, savedCents: 0, avgSpendingCents: 1_800_000, avgIncomeCents: 3_000_000, savingsRate: 0.05 },
    categories: [],
    recurring: [
      { merchant: "SPOTIFY", category: "subscriptions", monthlyCents: 11_900, steady: true },
      { merchant: "NETFLIX", category: "subscriptions", monthlyCents: 14_900, steady: true },
    ],
    weekday: [1, 1, 1, 1, 1, 1, 1],
    smallPurchases: { count: 90, cents: 450_000, months: 3 },
    categoryCounts: { fastfood: { count: 30, cents: 360_000, months: 3 } },
  });
  assert.ok(tips.length >= 4);
  for (let i = 1; i < tips.length; i += 1) {
    assert.ok((tips[i - 1]!.yearlyCents ?? 0) >= (tips[i]!.yearlyCents ?? 0));
  }
  assert.ok(tips.some((tip) => tip.id === "idle-cash"));
  assert.ok(tips.some((tip) => tip.id === "fastfood"));

  const budgets = suggestBudgets([
    { id: "fastfood", avgCents: 123_400, budgetCents: null },
    { id: "income", avgCents: 999_999, budgetCents: null },
    { id: "car", avgCents: 300_000, budgetCents: 250_000 },
  ]);
  assert.deepEqual(budgets.map((row) => [row.category, row.suggestedCents]), [["fastfood", 110_000]]);
});
