import { Prisma } from "@prisma/client";
import { expandJournalLinesExact, vatPostingSide, type BalanceEntry } from "./balances";
import { getAccountingDb } from "./db";
import { AccountingError } from "./errors";
import { exactCents, formatCents } from "./money";

export type ReportEntry = BalanceEntry & {
  id: string;
  description: string;
  source?: string | null;
  status?: string | null;
  receiptRequired: boolean;
  deletedAt?: Date | null;
  documents: Array<{ storageStatus: string; blobPathname: string | null; sha256?: string | null; deletedAt?: Date | null }>;
};
export type ReportAccount = { account: number; name: string };
export type Period = { dateFrom: string; dateTo: string };
type Finding = { code: string; severity: "error" | "warning"; entryId: string | null; message: string };
type Totals = { opening: bigint; debit: bigint; credit: bigint; count: number };
const isoDate = (date: ReportEntry["date"]) => date instanceof Date ? date.toISOString().slice(0, 10) : date?.slice(0, 10) ?? null;

/** Pure report engine shared by the API, visual workspace, and read-only audit. */
export function buildAccountingReport(entries: ReportEntry[], accounts: ReportAccount[], period: Period, includeJournal = false) {
  const names = new Map(accounts.map((account) => [account.account, account.name]));
  const totals = new Map<number, Totals>();
  const findings: Finding[] = [];
  const findingCounts: Record<string, number> = {};
  const findingEntryIds: Record<string, string[]> = {};
  let errorCount = 0;
  let warningCount = 0;
  const add = (code: string, severity: Finding["severity"], entryId: string | null, message: string) => {
    findingCounts[code] = (findingCounts[code] ?? 0) + 1;
    if (entryId && (findingEntryIds[code]?.length ?? 0) < 100) (findingEntryIds[code] ??= []).push(entryId);
    if (severity === "error") errorCount++; else warningCount++;
    if (findings.length < 500) findings.push({ code, severity, entryId, message });
  };
  const monthly = new Map<string, { revenue: bigint; expenses: bigint; bankMovement: bigint }>();
  const journal: Array<{ entryId: string; date: string; description: string; account: number; debit: string; credit: string }> = [];
  let periodEntries = 0;
  let undatedEntries = 0;
  let inputVat = 0n;
  let outputVat = 0n;
  const fingerprints = new Map<string, string>();
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const date = isoDate(entry.date);
    if (!date) {
      undatedEntries++;
      add("missing_date", "error", entry.id, "Undated entry cannot be assigned to a period or opening balance.");
      continue;
    }
    if (date > period.dateTo) continue;
    const inPeriod = date >= period.dateFrom;
    if (inPeriod) periodEntries++;
    // Earlier invalid rows can corrupt opening balances too; validate all history used.
    if (!entry.debitAccount || !entry.creditAccount) add("missing_account", "error", entry.id, "Both header accounts are required.");
    if (!entry.description.trim()) add("missing_description", "error", entry.id, "Entry description is empty.");
    if (entry.debitAccount === entry.creditAccount) add("same_account", "warning", entry.id, "Debit and credit use the same account; verify the economic event.");
    if (entry.vatAmount != null && exactCents(entry.vatAmount) !== 0n && (entry.vatAccount == null || vatPostingSide(entry.vatAccount) == null)) {
      add("unposted_vat", "error", entry.id, "Nonzero VAT has no supported VAT account and is not expanded into the ledger.");
    }
    if (inPeriod && entry.receiptRequired && !entry.documents.some((doc) => !doc.deletedAt && doc.storageStatus === "stored" && doc.blobPathname && doc.sha256)) {
      add("missing_receipt", "error", entry.id, "Required evidence has no stored file with a checksum.");
    }
    if (inPeriod && entry.status !== "Bokförd") add("review_status", "warning", entry.id, "Status needs review; this row is included, as in existing balances.");
    if (inPeriod) {
      const text = (entry.source || entry.description).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
      const key = `${date}|${exactCents(entry.amount)}|${text}`;
      const duplicate = fingerprints.get(key);
      if (duplicate) add("possible_duplicate", "warning", entry.id, `Same date, amount and source as ${duplicate}; compare evidence before changing anything.`);
      else fingerprints.set(key, entry.id);
    }
    const lines = expandJournalLinesExact(entry);
    const imbalance = lines.reduce((sum, line) => sum + line.debitCents - line.creditCents, 0n);
    if (imbalance !== 0n) add("unbalanced_entry", "error", entry.id, `Journal debit minus credit is ${formatCents(imbalance)} SEK. Check gross, net, VAT and accounts.`);
    const touched = new Set<number>();
    for (const line of lines) {
      if (!names.has(line.account)) add("unknown_account", "error", entry.id, `Account ${line.account} is absent from the active chart of accounts.`);
      const total = totals.get(line.account) ?? { opening: 0n, debit: 0n, credit: 0n, count: 0 };
      const signed = line.debitCents - line.creditCents;
      if (!inPeriod) total.opening += signed;
      else {
        total.debit += line.debitCents;
        total.credit += line.creditCents;
        touched.add(line.account);
        const month = monthly.get(date.slice(0, 7)) ?? { revenue: 0n, expenses: 0n, bankMovement: 0n };
        if (line.account >= 3000 && line.account < 4000) month.revenue -= signed;
        if (line.account >= 4000 && line.account < 9000) month.expenses += signed;
        if (line.account === 1930) month.bankMovement += signed;
        monthly.set(date.slice(0, 7), month);
        if (line.account >= 2610 && line.account <= 2639) outputVat -= signed;
        if (line.account >= 2640 && line.account <= 2649) inputVat += signed;
        if (includeJournal) journal.push({ entryId: entry.id, date, description: entry.description, account: line.account, debit: formatCents(line.debitCents), credit: formatCents(line.creditCents) });
      }
      totals.set(line.account, total);
    }
    for (const account of touched) totals.get(account)!.count++;
  }
  const rows = [...totals.entries()].sort(([a], [b]) => a - b).map(([account, row]) => ({
    account, name: names.get(account) ?? null,
    opening: formatCents(row.opening), debit: formatCents(row.debit), credit: formatCents(row.credit),
    movement: formatCents(row.debit - row.credit), closing: formatCents(row.opening + row.debit - row.credit), entryCount: row.count,
  }));
  let revenue = 0n, expenses = 0n, debit = 0n, credit = 0n, openingDifference = 0n;
  for (const [account, row] of totals) {
    const signed = row.debit - row.credit;
    debit += row.debit; credit += row.credit; openingDifference += row.opening;
    if (account >= 3000 && account < 4000) revenue -= signed;
    if (account >= 4000 && account < 9000) expenses += signed;
  }
  if (!periodEntries) add("empty_period", "error", null, "No dated ledger entries in the requested period.");
  return {
    period, currency: "SEK", basis: "Expanded journal lines, including VAT; all non-deleted statuses included. Opening is recorded dated history, not a certified fiscal-year rollover.",
    entryCount: periodEntries, undatedEntries,
    trialBalance: { accounts: rows, debit: formatCents(debit), credit: formatCents(credit), difference: formatCents(debit - credit), openingDifference: formatCents(openingDifference) },
    profitAndLoss: { revenue: formatCents(revenue), expenses: formatCents(expenses), result: formatCents(revenue - expenses), accounts: rows.filter((row) => row.account >= 3000 && row.account < 9000) },
    balanceSheet: { basis: "Recorded closing balances; unallocated result and year-end entries require review.", accounts: rows.filter((row) => row.account < 3000) },
    vat: { output: formatCents(outputVat), input: formatCents(inputVat), payable: formatCents(outputVat - inputVat), filingReady: false, note: "Account movements only, including settlements/corrections. Not a VAT return: tax-base boxes, EU sales, reverse charge and period settlements need review." },
    monthly: [...monthly].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, revenue: formatCents(values.revenue), expenses: formatCents(values.expenses), result: formatCents(values.revenue - values.expenses), bankMovement: formatCents(values.bankMovement) })),
    readiness: {
      status: "requires_review", declarationReady: false, errorCount, warningCount, findingCounts, findingEntryIds, findings,
      findingsTruncated: errorCount + warningCount > findings.length,
      externalChecklist: [
        "Confirm registered fiscal year, organisation number, accounting method and VAT registration/period.",
        "Reconcile bank, tax account, owner loans, capital insurance, receivables and payables with original statements.",
        "Review opening balances, accruals, depreciation, non-deductible costs, foreign/EU VAT and year-end tax/result entries.",
        "Prepare and validate INK2, INK2R and INK2S with the applicable BAS/SRU mapping; file and retain submission receipt externally.",
        "Prepare, sign and submit the annual report separately; retain the receipt.",
        "This system has revision history but no immutable numbered journal, locked fiscal periods, general multi-line vouchers or certified SIE/SRU export yet.",
      ],
    },
    ...(includeJournal ? { journal } : {}),
  };
}

/** One consistent, bounded snapshot; never silently report a partial ledger. */
export async function loadReportSnapshot(period: Period) {
  return getAccountingDb().$transaction(async (tx) => {
    const entries = await tx.accountingEntry.findMany({
      where: { deletedAt: null, OR: [{ date: { lte: new Date(`${period.dateTo}T00:00:00Z`) } }, { date: null }] },
      orderBy: [{ date: "asc" }, { id: "asc" }], take: 50_001,
      include: { documents: { where: { deletedAt: null }, select: { storageStatus: true, blobPathname: true, sha256: true } } },
    });
    if (entries.length > 50_000) throw new AccountingError("Report exceeds 50,000 entries. Use a database export for this ledger.", 422, "report_too_large");
    const accounts = await tx.accountingAccount.findMany({ where: { deletedAt: null }, select: { account: true, name: true } });
    const latestBackup = await tx.accountingBackup.findFirst({ orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } });
    const pendingDrafts = await tx.accountingAiDraft.count({ where: { status: "pending" } });
    return { entries, accounts, latestBackup, pendingDrafts, generatedAt: new Date().toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}

export async function accountingReport(period: Period, includeJournal = false) {
  const snapshot = await loadReportSnapshot(period);
  return { ...buildAccountingReport(snapshot.entries, snapshot.accounts, period, includeJournal), generatedAt: snapshot.generatedAt,
    pendingDrafts: snapshot.pendingDrafts, latestBackup: snapshot.latestBackup };
}

export function journalCsv(report: ReturnType<typeof buildAccountingReport>) {
  // Prefix formula-like user text; quote every cell, preserving multiline descriptions safely.
  const cell = (value: string | number) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
  return "\uFEFF" + [["entryId", "date", "description", "account", "debit", "credit"], ...(report.journal ?? []).map((line) => [line.entryId, line.date, line.description, line.account, line.debit, line.credit])].map((row) => row.map(cell).join(",")).join("\r\n");
}
