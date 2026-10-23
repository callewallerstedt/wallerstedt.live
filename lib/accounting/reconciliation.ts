import { z } from "zod";
import { expandJournalLinesExact } from "./balances";
import { exactCents, formatCents } from "./money";
import { calendarDate } from "./query";
import { loadReportSnapshot, type ReportEntry } from "./reports";

const money = z.string().regex(/^-?\d{1,16}(?:\.\d{1,2})?$/);
export const reconciliationSchema = z.object({
  account: z.number().int().min(1000).max(9999),
  dateFrom: calendarDate, dateTo: calendarDate,
  openingBalance: money, closingBalance: money,
  rows: z.array(z.object({ id: z.string().max(200), date: calendarDate, amount: money })).max(10_000).optional(),
}).superRefine((input, context) => {
  if (input.dateFrom > input.dateTo) context.addIssue({ code: "custom", path: ["dateTo"], message: "Invalid period." });
  if (input.rows) {
    if (new Set(input.rows.map((row) => row.id)).size !== input.rows.length) context.addIssue({ code: "custom", path: ["rows"], message: "Statement row IDs must be unique." });
    if (input.rows.some((row) => row.date < input.dateFrom || row.date > input.dateTo)) context.addIssue({ code: "custom", path: ["rows"], message: "Statement rows must be within the period." });
  }
});

export function reconcileEntries(entries: ReportEntry[], input: z.output<typeof reconciliationSchema>) {
  let opening = 0n, movement = 0n;
  const ledger: Array<{ entryId: string; date: string; amount: string }> = [];
  const undated: string[] = [];
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const lines = expandJournalLinesExact(entry).filter((line) => line.account === input.account);
    if (!lines.length) continue;
    const date = entry.date instanceof Date ? entry.date.toISOString().slice(0, 10) : entry.date?.slice(0, 10);
    if (!date) { undated.push(entry.id); continue; }
    if (date > input.dateTo) continue;
    const signed = lines.reduce((sum, line) => sum + line.debitCents - line.creditCents, 0n);
    if (date < input.dateFrom) opening += signed;
    else { movement += signed; ledger.push({ entryId: entry.id, date, amount: formatCents(signed) }); }
  }
  const openingDifference = opening - exactCents(input.openingBalance);
  const closingDifference = opening + movement - exactCents(input.closingBalance);
  const statementMovement = input.rows?.reduce((sum, row) => sum + exactCents(row.amount), 0n);
  const statementDifference = statementMovement === undefined ? null : exactCents(input.openingBalance) + statementMovement - exactCents(input.closingBalance);
  const groupedLedger = new Map<string, typeof ledger>();
  for (const row of ledger) {
    const key = `${row.date}|${exactCents(row.amount)}`;
    const group = groupedLedger.get(key) ?? []; group.push(row); groupedLedger.set(key, group);
  }
  const groupedStatement = new Map<string, NonNullable<typeof input.rows>>();
  for (const row of input.rows ?? []) {
    const key = `${row.date}|${exactCents(row.amount)}`;
    const group = groupedStatement.get(key) ?? []; group.push(row); groupedStatement.set(key, group);
  }
  const matches: Array<{ statementId: string; entryId: string }> = [];
  const ambiguous: Array<{ statementIds: string[]; entryIds: string[] }> = [];
  const unmatchedStatement: string[] = [], unmatchedLedger: string[] = [];
  if (input.rows) for (const key of new Set([...groupedLedger.keys(), ...groupedStatement.keys()])) {
    const bank = groupedStatement.get(key) ?? [], books = groupedLedger.get(key) ?? [];
    if (bank.length === 1 && books.length === 1) matches.push({ statementId: bank[0].id, entryId: books[0].entryId });
    else if (bank.length && books.length) ambiguous.push({ statementIds: bank.map((row) => row.id), entryIds: books.map((row) => row.entryId) });
    else { unmatchedStatement.push(...bank.map((row) => row.id)); unmatchedLedger.push(...books.map((row) => row.entryId)); }
  }
  return {
    account: input.account, period: { dateFrom: input.dateFrom, dateTo: input.dateTo },
    ledger: { opening: formatCents(opening), movement: formatCents(movement), closing: formatCents(opening + movement) },
    openingDifference: formatCents(openingDifference), closingDifference: formatCents(closingDifference),
    statementDifference: statementDifference === null ? null : formatCents(statementDifference),
    balancesAgree: openingDifference === 0n && closingDifference === 0n && !undated.length,
    transactionMatchingPerformed: input.rows !== undefined,
    matches, ambiguous, unmatchedStatement, unmatchedLedger, undatedEntryIds: undated,
    reconciled: input.rows !== undefined && openingDifference === 0n && closingDifference === 0n && statementDifference === 0n && !undated.length && !ambiguous.length && !unmatchedStatement.length && !unmatchedLedger.length,
    note: "Read-only comparison of signed debit-minus-credit movements and statement rows by date/amount. Matching is a candidate, not proof of the business purpose. Nothing is posted or marked reconciled.",
  };
}

export async function reconcileAccounting(input: z.output<typeof reconciliationSchema>) {
  const snapshot = await loadReportSnapshot(input);
  return { ...reconcileEntries(snapshot.entries, input), generatedAt: snapshot.generatedAt };
}
