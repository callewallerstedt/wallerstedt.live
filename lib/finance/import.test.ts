import assert from "node:assert/strict";
import { test } from "node:test";

import { parseHandelsbankenStatement } from "./import";

test("parses a Handelsbanken account export", () => {
  const parsed = parseHandelsbankenStatement([
    ["Handelsbanken", null, null, null, null],
    ["2026-09-23, 15:24", null, null, null, null],
    [null, null, null, null, null],
    ["1 - KBK - Kör bara kör 577 252 151", null, null, null, null],
    ["Kontoform: Allkonto", "Clearingnummer: 6233", "Saldo: 623.93", null, null],
    ["Period: 2024-09-24 - 2026-09-23", "Transaktionstyp: Alla", null, null, null],
    ["Reskontradatum", "Transaktionsdatum", "Text", "Belopp", "Saldo"],
    [null, "2026-09-22", "Prel AMZNPrim", -103.23, 623.93],
    ["2026-09-22", "2026-09-21", "MaxBurgers", -97, 924.71],
    ["2026-08-31", "2026-08-28", "STUDIESTÖD", 13442, 5791.96],
  ]);
  assert.equal(parsed.accountNumber, "577252151");
  assert.equal(parsed.accountName, "KBK - Kör bara kör");
  assert.equal(parsed.balanceCents, 62_393);
  assert.equal(parsed.skippedPending, 1);
  assert.deepEqual(parsed.rows.map((row) => [row.date, row.text, row.amountCents]), [
    ["2026-09-22", "MaxBurgers", -9_700],
    ["2026-08-31", "STUDIESTÖD", 1_344_200],
  ]);
});
