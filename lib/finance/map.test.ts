import assert from "node:assert/strict";
import { test } from "node:test";

import { mapTransactions } from "./store";

test("maps Enable Banking rows with signs, ids and merchants", () => {
  const rows = mapTransactions("acc1", [
    {
      transaction_amount: { currency: "SEK", amount: "129.00" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: "2026-09-20",
      remittance_information: ["KORTKÖP 260919 MAX BURGERS"],
      entry_reference: "ref-1",
    },
    {
      transaction_amount: { currency: "SEK", amount: "25000" },
      credit_debit_indicator: "CRDT",
      status: "BOOK",
      booking_date: "2026-09-25",
      debtor: { name: "WALLERSTEDT PRODUCTIONS AB" },
      remittance_information: ["LÖN"],
    },
    {
      transaction_amount: { currency: "SEK", amount: "50" },
      credit_debit_indicator: "DBIT",
      status: "PDNG",
      booking_date: "2026-09-26",
      remittance_information: ["PRESSBYRÅN"],
    },
    {
      transaction_amount: { currency: "SEK", amount: "50" },
      credit_debit_indicator: "DBIT",
      status: "PDNG",
      booking_date: "2026-09-26",
      remittance_information: ["PRESSBYRÅN"],
    },
  ]);
  assert.equal(rows[0]!.amountCents, -12_900);
  assert.equal(rows[0]!.id, "acc1:ref-1");
  assert.equal(rows[0]!.merchant, "MAX BURGERS");
  assert.equal(rows[1]!.amountCents, 2_500_000);
  assert.equal(rows[1]!.counterparty, "WALLERSTEDT PRODUCTIONS AB");
  assert.equal(rows[2]!.status, "PDNG");
  // Two identical pending lines stay two rows.
  assert.notEqual(rows[2]!.id, rows[3]!.id);
});
