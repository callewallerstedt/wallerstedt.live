import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountingReport, journalCsv, type ReportEntry } from "./reports";
import { exactCents, formatCents } from "./money";
import { entryQuery, reportPeriod } from "./query";
import { reconcileEntries, reconciliationSchema } from "./reconciliation";
import { parseJson } from "./http";
import { agentEntryCreateSchema } from "./validation";
import { assertJournalIntegrity } from "./service";
import { calculateAccountBalances } from "./balances";

const period = { dateFrom: "2026-07-01", dateTo: "2026-07-31" };
const accounts = [1930, 2893, 3001, 5410, 2641, 2611].map((account) => ({ account, name: String(account) }));
function entry(patch: Partial<ReportEntry> = {}): ReportEntry {
  return { id: "a", date: "2026-07-01", amount: "125.00", amountExVat: "100.00", vatAmount: "25.00", vatAccount: 2641,
    debitAccount: 5410, creditAccount: 1930, description: "Office", status: "Bokförd", receiptRequired: false, documents: [], ...patch };
}
test("period reports share VAT expansion and exact account-based profit, not payment labels", () => {
  const report = buildAccountingReport([
    entry({ id: "opening", date: "2026-06-30", amount: "1000.00", amountExVat: null, vatAmount: null, vatAccount: null, debitAccount: 1930, creditAccount: 2893 }),
    entry(),
    entry({ id: "sale", amount: "250.00", amountExVat: "200.00", vatAmount: "50.00", vatAccount: 2611, debitAccount: 1930, creditAccount: 3001 }),
    entry({ id: "future", date: "2026-08-01" }),
  ], accounts, period, true);
  assert.equal(report.entryCount, 2);
  assert.deepEqual([report.profitAndLoss.revenue, report.profitAndLoss.expenses, report.profitAndLoss.result], ["200.00", "100.00", "100.00"]);
  const bank = report.trialBalance.accounts.find((row) => row.account === 1930)!;
  assert.deepEqual([bank.opening, bank.movement, bank.closing], ["1000.00", "125.00", "1125.00"]);
  assert.equal(report.trialBalance.difference, "0.00");
  assert.equal(report.vat.payable, "25.00");
  assert.equal(report.monthly[0].bankMovement, "125.00");
  assert.equal(report.journal?.length, 6);
  assert.equal(report.readiness.declarationReady, false);
});
test("reports preserve cents beyond JavaScript safe-integer precision", () => {
  const report = buildAccountingReport([entry({ amount: "9999999999999999.99", amountExVat: null, vatAmount: null, vatAccount: null })], accounts, period);
  assert.equal(report.profitAndLoss.expenses, "9999999999999999.99");
  assert.equal(report.trialBalance.debit, "9999999999999999.99");
  assert.equal(report.trialBalance.difference, "0.00");
  assert.equal(formatCents(exactCents("-0.01")), "-0.01");
  assert.throws(() => exactCents("not money"));
  assert.throws(() => exactCents("1.001"));
});
test("negative corrections reverse net expense and VAT exactly", () => {
  const report = buildAccountingReport([entry(), entry({ id: "reversal", amount: "-125.00", amountExVat: "-100.00", vatAmount: "-25.00" })], accounts, period);
  assert.equal(report.profitAndLoss.result, "0.00");
  assert.equal(report.vat.payable, "0.00");
});
test("overall balance cannot hide two individually unbalanced VAT entries", () => {
  const report = buildAccountingReport([entry({ amountExVat: "90.00" }), entry({ id: "b", amountExVat: "110.00" })], accounts, period);
  assert.equal(report.trialBalance.difference, "0.00");
  assert.equal(report.readiness.findingCounts.unbalanced_entry, 2);
});
test("readiness detects undated, unknown, missing evidence and unposted VAT", () => {
  const report = buildAccountingReport([
    entry({ date: null }), entry({ id: "b", vatAccount: 9999, debitAccount: 9998, receiptRequired: true, documents: [{ storageStatus: "metadata_only", blobPathname: null }] }),
  ], accounts, period);
  assert.equal(report.undatedEntries, 1);
  assert.equal(report.readiness.findingCounts.missing_date, 1);
  assert.equal(report.readiness.findingCounts.unposted_vat, 1);
  assert.equal(report.readiness.findingCounts.unknown_account, 1);
  assert.equal(report.readiness.findingCounts.missing_receipt, 1);
});
test("deleted entries are excluded and metadata-only evidence never satisfies receipt requirements", () => {
  const report = buildAccountingReport([entry({ deletedAt: new Date() }), entry({ id: "b", receiptRequired: true, documents: [{ storageStatus: "stored", blobPathname: "file", sha256: "hash" }] })], accounts, period);
  assert.equal(report.entryCount, 1);
  assert.equal(report.readiness.errorCount, 0);
});
test("CSV escapes formulas, quotes and multiline descriptions", () => {
  const report = buildAccountingReport([entry({ description: '=HYPERLINK("evil")\nline' })], accounts, period, true);
  const csv = journalCsv(report);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=HYPERLINK(""evil"")\nline"'));
});
test("search validates real dates, ordered ranges, booleans and integer pagination", () => {
  for (const input of ["dateFrom=2026-02-30", "dateFrom=2026-08-01&dateTo=2026-07-01", "page=1.2", "limit=Infinity", "missingReceipts=maybe", "minAmount=20&maxAmount=10"]) {
    assert.throws(() => entryQuery(new URLSearchParams(input)), input);
  }
  const query = entryQuery(new URLSearchParams("account=2641&missingReceipts=true&minAmount=-10.00&dateFrom=2026-07-01"));
  assert.equal(query.account, 2641);
  assert.ok(query.where.AND);
  assert.throws(() => reportPeriod(new URLSearchParams("dateFrom=2026-01-01")));
});
test("reconciliation validates opening and closing, statement arithmetic and row multiplicity", () => {
  const rows = [entry({ amount: "1000.00", amountExVat: null, vatAmount: null, vatAccount: null, date: "2026-06-30", debitAccount: 1930, creditAccount: 2893 }), entry()];
  const input = { account: 1930, ...period, openingBalance: "1000.00", closingBalance: "875.00", rows: [{ id: "bank1", date: "2026-07-01", amount: "-125.00" }] };
  const result = reconcileEntries(rows, input);
  assert.equal(result.reconciled, true);
  assert.equal(result.matches.length, 1);
  assert.equal(reconcileEntries(rows, { ...input, rows: undefined }).reconciled, false);
  assert.equal(reconcileEntries(rows, { ...input, openingBalance: "999.00" }).reconciled, false);
  const duplicateRows = reconcileEntries([...rows, entry({ id: "duplicate" })], input);
  assert.equal(duplicateRows.reconciled, false);
  assert.equal(duplicateRows.ambiguous.length, 1);
  assert.equal(duplicateRows.matches.length, 0);
  assert.equal(reconciliationSchema.safeParse({ ...input, rows: [...input.rows, ...input.rows] }).success, false);
});
test("JSON byte limits apply without Content-Length and count UTF-8 bytes", async () => {
  const request = new Request("https://example.test", { method: "POST", body: JSON.stringify({ text: "å".repeat(40) }) });
  await assert.rejects(() => parseJson(request, 60), (error: unknown) => (error as { code: string }).code === "body_too_large");
  assert.deepEqual(await parseJson(new Request("https://example.test", { method: "POST", body: '{"amount":"12.34"}' })), { amount: "12.34" });
});
test("bank identities require both scope and ID", () => {
  const base = { bankText: "Payment", date: "2026-07-01", amount: "12.00" };
  assert.equal(agentEntryCreateSchema.safeParse({ ...base, bankTransactionId: "abc" }).success, false);
  assert.equal(agentEntryCreateSchema.safeParse({ ...base, bankAccountId: "company", bankTransactionId: "abc" }).success, true);
});

test("ledger writes reject incomplete or unbalanced VAT postings while accepting signed corrections", () => {
  assert.doesNotThrow(() => assertJournalIntegrity(entry()));
  for (const patch of [{ date: null }, { description: "" }, { creditAccount: null }, { amountExVat: "99.99" }, { vatAccount: null }]) {
    assert.throws(() => assertJournalIntegrity(entry(patch)), (error: unknown) => (error as { code: string }).code === "invalid_journal");
  }
  assert.doesNotThrow(() => assertJournalIntegrity(entry({ amount: "-125.00", amountExVat: "-100.00", vatAmount: "-25.00" })));
});
test("numeric balance endpoints reject aggregate overflow instead of silently rounding cents", () => {
  assert.throws(() => calculateAccountBalances([
    entry({ amount: "90071992547409.91", amountExVat: null, vatAmount: null, vatAccount: null, debitAccount: 1930, creditAccount: 2893 }),
    entry({ amount: "0.01", amountExVat: null, vatAmount: null, vatAccount: null, debitAccount: 1930, creditAccount: 3001 }),
  ]), (error: unknown) => (error as { code: string }).code === "money_out_of_range");
});
test("agent input rejects unknown field names instead of silently discarding bot typos", () => {
  assert.equal(agentEntryCreateSchema.safeParse({ bankText: "x", date: "2026-07-01", amount: "12.00", debtiAccount: 5410 }).success, false);
});
