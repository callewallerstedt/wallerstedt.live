import { calculateAccountBalances, calculateSelectedAccountBalances } from "@/lib/accounting/balances";

import { COMPANY, LEDGER_BALANCE_ACCOUNTS } from "./company";
import { lastNMonths, moneyToCents, monthEndYmd, monthKey, yearKey } from "./format";
import type {
  CategoryRow,
  CounterpartyRow,
  CumulativePoint,
  LedgerEntryRow,
  LedgerSnapshot,
  MonthPoint,
  RecurringRow,
} from "./types";

export type RawLedgerEntry = {
  id: string;
  date: Date | string | null;
  description: string | null;
  debitAccount: number | null;
  creditAccount: number | null;
  debitName: string | null;
  creditName: string | null;
  amount: number | string | { toString(): string };
  vatAmount?: number | string | { toString(): string } | null;
  type: string | null;
  receiptRequired: boolean;
  documentCount: number;
};

export type LedgerAccount = {
  account: number;
  name: string;
};

const SOFTWARE_HINTS =
  /adobe|spotify|vercel|github|openai|chatgpt|cursor|figma|notion|icloud|google|apple|dropbox|distrokid|midjourney|anthropic|microsoft|office 365|canva/i;
const ADS_HINTS = /meta ads|facebook ads|tiktok ads|google ads|ads? manager|annon/i;
const ACCOUNTING_HINTS = /bokför|revisor|visma|fortnox|skatteverk|accounting/i;
const HARDWARE_HINTS = /macbook|iphone|ipad|keyboard|monitor|skärm|dator|laptop|airpods|piano|mikrofon|interface/i;

export function entryKind(type: string | null | undefined): LedgerEntryRow["kind"] {
  const value = (type ?? "").toLocaleLowerCase("sv");
  if (value.includes("inbetal") || value === "income") return "income";
  if (value.includes("utbetal") || value === "expense") return "expense";
  if (value.includes("skuld") || value.includes("debt")) return "debt";
  return "other";
}

function entryDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const ymd = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export function normalizeLedgerEntries(entries: RawLedgerEntry[]): LedgerEntryRow[] {
  return entries.map((entry) => {
    const kind = entryKind(entry.type);
    const documentCount = entry.documentCount;
    const signedCents = moneyToCents(entry.amount);
    const signedVatCents = moneyToCents(entry.vatAmount);
    return {
      id: entry.id,
      date: entryDate(entry.date),
      description: entry.description?.trim() || "Utan text",
      debitAccount: entry.debitAccount,
      creditAccount: entry.creditAccount,
      debitName: entry.debitName,
      creditName: entry.creditName,
      // Vault dashboard() uses amount.abs() for Utbetalning so a negative
      // expense cannot shrink the expense total and inflate profit.
      amountCents: kind === "expense" ? Math.abs(signedCents) : signedCents,
      vatCents: kind === "expense" ? Math.abs(signedVatCents) : signedVatCents,
      type: entry.type ?? "",
      kind,
      receiptRequired: entry.receiptRequired,
      documentCount,
      missingReceipt: kind === "expense" && entry.receiptRequired && documentCount === 0,
    };
  });
}

function inMonth(entry: LedgerEntryRow, month: string) {
  return monthKey(entry.date) === month;
}

function inYear(entry: LedgerEntryRow, year: string) {
  return yearKey(entry.date) === year;
}

function sum(entries: LedgerEntryRow[], pick: (entry: LedgerEntryRow) => number) {
  return entries.reduce((total, entry) => total + pick(entry), 0);
}

function expenseAccount(entry: LedgerEntryRow) {
  return entry.debitAccount;
}

function classifyExpense(entry: LedgerEntryRow, accountNames: Record<number, string>) {
  const hay = `${entry.description} ${entry.debitName ?? ""} ${entry.creditName ?? ""} ${
    entry.debitAccount ? accountNames[entry.debitAccount] ?? "" : ""
  }`;
  if (ADS_HINTS.test(hay) || (entry.debitAccount != null && entry.debitAccount >= 5900 && entry.debitAccount < 6000)) {
    return "ads" as const;
  }
  if (ACCOUNTING_HINTS.test(hay) || entry.debitAccount === 6530 || entry.debitAccount === 6991) {
    return "accounting" as const;
  }
  if (HARDWARE_HINTS.test(hay) || (entry.debitAccount != null && entry.debitAccount >= 1200 && entry.debitAccount < 1300)) {
    return "hardware" as const;
  }
  if (SOFTWARE_HINTS.test(hay) || entry.debitAccount === 6540 || entry.debitAccount === 5420) {
    return "software" as const;
  }
  return "other" as const;
}

function normalizeRecurringKey(description: string) {
  return description
    .toLocaleLowerCase("sv")
    .replace(/\d[\d\s.,]*/g, " ")
    .replace(/[^a-zåäö0-9]+/gi, " ")
    .trim();
}

function counterpartyName(entry: LedgerEntryRow) {
  const text = entry.description.replace(/\s+/g, " ").trim();
  return text || "Okänd";
}

function runningAccountByMonth(
  rawEntries: RawLedgerEntry[],
  monthKeys: string[],
  nowYmd: string,
  account: number,
) {
  const dated = rawEntries
    .map((entry) => ({ entry, date: entryDate(entry.date) }))
    .filter((row): row is { entry: RawLedgerEntry; date: string } => Boolean(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const result = new Map<string, number>();
  let balance = 0;
  let index = 0;
  for (const key of monthKeys) {
    const end = monthEndYmd(key);
    const cutoff = end > nowYmd ? nowYmd : end;
    while (index < dated.length && dated[index]!.date <= cutoff) {
      const amount = moneyToCents(dated[index]!.entry.amount);
      if (dated[index]!.entry.debitAccount === account) balance += amount;
      if (dated[index]!.entry.creditAccount === account) balance -= amount;
      index += 1;
    }
    result.set(key, balance);
  }
  return result;
}

export function buildLedgerSnapshot(
  rawEntries: RawLedgerEntry[],
  accounts: LedgerAccount[],
  pendingDraftCount: number,
  nowYmd: string,
): LedgerSnapshot {
  const entries = normalizeLedgerEntries(rawEntries);
  const accountNames = Object.fromEntries(accounts.map((account) => [account.account, account.name]));
  const year = nowYmd.slice(0, 4);
  const month = nowYmd.slice(0, 7);
  const monthKeys = lastNMonths(nowYmd, 12);

  const income = entries.filter((entry) => entry.kind === "income");
  const expenses = entries.filter((entry) => entry.kind === "expense");
  const debtEntries = entries.filter((entry) => entry.kind === "debt");

  const lastMonth = monthKeys[monthKeys.length - 2] ?? month;
  const incomeMonth = income.filter((entry) => inMonth(entry, month));
  const incomeLastMonth = income.filter((entry) => inMonth(entry, lastMonth));
  const incomeYtd = income.filter((entry) => inYear(entry, year));
  const expenseMonth = expenses.filter((entry) => inMonth(entry, month));
  const expenseLastMonth = expenses.filter((entry) => inMonth(entry, lastMonth));
  const expenseYtd = expenses.filter((entry) => inYear(entry, year));

  const incomeMonthCents = sum(incomeMonth, (entry) => entry.amountCents);
  const incomeLastMonthCents = sum(incomeLastMonth, (entry) => entry.amountCents);
  const incomeYtdCents = sum(incomeYtd, (entry) => entry.amountCents);
  const expenseMonthCents = sum(expenseMonth, (entry) => entry.amountCents);
  const expenseLastMonthCents = sum(expenseLastMonth, (entry) => entry.amountCents);
  const expenseYtdCents = sum(expenseYtd, (entry) => entry.amountCents);
  const profitYtdCents = incomeYtdCents - expenseYtdCents;
  const vatPayableCents =
    sum(income, (entry) => entry.vatCents) - sum(expenses, (entry) => entry.vatCents);
  const vatYtdCents =
    sum(incomeYtd, (entry) => entry.vatCents) - sum(expenseYtd, (entry) => entry.vatCents);

  const bankByMonth = runningAccountByMonth(rawEntries, monthKeys, nowYmd, COMPANY.accounts.bank);
  const kfByMonth = runningAccountByMonth(rawEntries, monthKeys, nowYmd, COMPANY.accounts.capitalInsurance);

  const months: MonthPoint[] = monthKeys.map((key) => {
    const incomeCents = sum(
      income.filter((entry) => inMonth(entry, key)),
      (entry) => entry.amountCents,
    );
    const expenseCents = sum(
      expenses.filter((entry) => inMonth(entry, key)),
      (entry) => entry.amountCents,
    );
    return {
      month: key,
      incomeCents,
      expenseCents,
      resultCents: incomeCents - expenseCents,
      bankCents: bankByMonth.get(key) ?? 0,
      kfCents: kfByMonth.get(key) ?? 0,
    };
  });

  // Every income and expense in date order, carrying the running result with
  // it, so a chart can show each individual movement rather than a monthly
  // rollup. Older points are dropped first when the ledger gets long.
  const cumulative: CumulativePoint[] = [];
  let running = 0;
  const movements = [...income, ...expenses]
    .filter((entry): entry is typeof entry & { date: string } => Boolean(entry.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const entry of movements) {
    running += entry.kind === "income" ? entry.amountCents : -entry.amountCents;
    cumulative.push({
      date: entry.date,
      label: entry.description,
      deltaCents: entry.kind === "income" ? entry.amountCents : -entry.amountCents,
      totalCents: running,
      kind: entry.kind === "income" ? "income" : "expense",
    });
  }

  const balances = calculateAccountBalances(
    rawEntries.map((entry) => ({
      amount: entry.amount,
      debitAccount: entry.debitAccount,
      creditAccount: entry.creditAccount,
      date: entry.date,
    })),
  );
  const selected = calculateSelectedAccountBalances(
    rawEntries.map((entry) => ({
      amount: entry.amount,
      debitAccount: entry.debitAccount,
      creditAccount: entry.creditAccount,
      date: entry.date,
    })),
    [...LEDGER_BALANCE_ACCOUNTS],
  );
  const selectedMap = new Map(selected.balances.map((row) => [row.account, row]));
  const usedAccounts = new Set(
    rawEntries.flatMap((entry) => [entry.debitAccount, entry.creditAccount]).filter((value): value is number => value != null),
  );

  const bankCents = balances.companyAccountCents;
  const kfDepositedCents = balances.capitalInsuranceCents;
  const corpTaxEstimateCents = Math.max(0, Math.round(profitYtdCents * COMPANY.corpTaxRate));
  const cashAfterTaxCents = bankCents - Math.max(0, vatPayableCents) - corpTaxEstimateCents;

  const missingReceipts = expenses.filter((entry) => entry.missingReceipt);
  const ytdExpenses = expenseYtd.slice().sort((a, b) => b.amountCents - a.amountCents);

  const categoryMap = new Map<string, CategoryRow>();
  for (const entry of expenseYtd) {
    const account = expenseAccount(entry);
    const key = account != null ? String(account) : "unknown";
    const current = categoryMap.get(key) ?? {
      key,
      label: account != null ? `${account} ${accountNames[account] ?? entry.debitName ?? ""}`.trim() : "Okänt konto",
      account,
      cents: 0,
      count: 0,
    };
    current.cents += entry.amountCents;
    current.count += 1;
    categoryMap.set(key, current);
  }

  let softwareCents = 0;
  let hardwareCents = 0;
  let adsCents = 0;
  let accountingCents = 0;
  for (const entry of expenseYtd) {
    const bucket = classifyExpense(entry, accountNames);
    if (bucket === "software") softwareCents += entry.amountCents;
    if (bucket === "hardware") hardwareCents += entry.amountCents;
    if (bucket === "ads") adsCents += entry.amountCents;
    if (bucket === "accounting") accountingCents += entry.amountCents;
  }

  const recurringMap = new Map<string, RecurringRow & { monthSet: Set<string> }>();
  for (const entry of expenses) {
    const key = normalizeRecurringKey(entry.description);
    if (key.length < 4) continue;
    const month = monthKey(entry.date);
    const current = recurringMap.get(key) ?? {
      label: entry.description,
      months: 0,
      lastCents: entry.amountCents,
      lastDate: entry.date,
      totalCents: 0,
      monthSet: new Set<string>(),
    };
    current.totalCents += entry.amountCents;
    if (month) current.monthSet.add(month);
    if (!current.lastDate || (entry.date && entry.date > current.lastDate)) {
      current.lastDate = entry.date;
      current.lastCents = entry.amountCents;
      current.label = entry.description;
    }
    recurringMap.set(key, current);
  }
  const recurring = [...recurringMap.values()]
    .map(({ monthSet, ...row }) => ({ ...row, months: monthSet.size }))
    .filter((row) => row.months >= 2)
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 12);

  const counterpartyMap = new Map<string, CounterpartyRow>();
  for (const entry of income) {
    const name = counterpartyName(entry);
    const current = counterpartyMap.get(name) ?? {
      name,
      cents: 0,
      count: 0,
      lastDate: entry.date,
    };
    current.cents += entry.amountCents;
    current.count += 1;
    if (!current.lastDate || (entry.date && entry.date > current.lastDate)) current.lastDate = entry.date;
    counterpartyMap.set(name, current);
  }

  return {
    asOf: balances.asOf,
    generatedOn: nowYmd,
    year,
    month,
    incomeMonthCents,
    incomeLastMonthCents,
    incomeYtdCents,
    expenseMonthCents,
    expenseLastMonthCents,
    expenseYtdCents,
    profitMonthCents: incomeMonthCents - expenseMonthCents,
    profitLastMonthCents: incomeLastMonthCents - expenseLastMonthCents,
    profitYtdCents,
    lastMonth,
    vatPayableCents,
    vatYtdCents,
    debtCents: sum(debtEntries, (entry) => entry.amountCents),
    bankCents,
    kfDepositedCents,
    ledgerAssetsCents: bankCents + kfDepositedCents,
    taxAccountCents: usedAccounts.has(COMPANY.accounts.taxAccount)
      ? selectedMap.get(COMPANY.accounts.taxAccount)?.balanceCents ?? 0
      : null,
    employerCents: usedAccounts.has(COMPANY.accounts.employer)
      ? selectedMap.get(COMPANY.accounts.employer)?.balanceCents ?? 0
      : null,
    withholdingCents: usedAccounts.has(COMPANY.accounts.withholding)
      ? selectedMap.get(COMPANY.accounts.withholding)?.balanceCents ?? 0
      : null,
    corpTaxBookedCents: usedAccounts.has(COMPANY.accounts.corpTax)
      ? selectedMap.get(COMPANY.accounts.corpTax)?.balanceCents ?? 0
      : null,
    corpTaxEstimateCents,
    cashAfterTaxCents,
    afterTaxYtdCents: profitYtdCents - corpTaxEstimateCents,
    missingReceiptCount: missingReceipts.length,
    pendingDraftCount,
    entryCount: entries.length,
    months,
    cumulative: cumulative.slice(-500),
    recent: entries.slice(0, 20),
    missingReceipts: missingReceipts.slice(0, 20),
    largestExpenses: ytdExpenses.slice(0, 10),
    categories: [...categoryMap.values()].sort((a, b) => b.cents - a.cents).slice(0, 12),
    softwareCents,
    hardwareCents,
    adsCents,
    accountingCents,
    recurring,
    counterparties: [...counterpartyMap.values()].sort((a, b) => b.cents - a.cents).slice(0, 12),
    expenses,
    accountNames,
  };
}
