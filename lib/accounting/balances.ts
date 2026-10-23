import { exactCents, formatCents, safeCentsNumber, type MoneyLike } from "./money";

export type BalanceEntry = {
  amount: MoneyLike;
  debitAccount: number | null;
  creditAccount: number | null;
  date?: Date | string | null;
  /** Net amount on the result account when VAT is split out. */
  amountExVat?: MoneyLike | null;
  vatAmount?: MoneyLike | null;
  /** BAS account for the VAT leg, usually 2641 or 2611. Not a third stored row. */
  vatAccount?: number | null;
};

export type JournalLine = {
  account: number;
  debitCents: number;
  creditCents: number;
};

/**
 * Which side a VAT account is posted on.
 * 2610–2639 are utgående moms (including 2614, omvänd skattskyldighet): credit.
 * 2640–2649 are ingående moms (including 2641 and 2645): debit.
 */
export function vatPostingSide(account: number): "debit" | "credit" | null {
  if (account >= 2610 && account <= 2639) return "credit";
  if (account >= 2640 && account <= 2649) return "debit";
  return null;
}

export function hasVatSplit(entry: BalanceEntry) {
  if (entry.vatAccount == null || entry.vatAmount == null) return false;
  if (vatPostingSide(entry.vatAccount) == null) return false;
  return exactCents(entry.vatAmount) !== 0n;
}

/**
 * One verifikation is stored as a header (debit, credit, gross amount) plus an
 * optional VAT split. Expand that into the journal lines an accountant sums.
 * A header with no VAT split stays two lines. Omvänd moms booked directly as
 * Dr 2645 / Cr 2614 has no vatAccount, so it is left as those two lines.
 */
export function expandJournalLines(entry: BalanceEntry): JournalLine[] {
  return expandJournalLinesExact(entry).map((line) => ({
    account: line.account,
    debitCents: safeCentsNumber(line.debitCents),
    creditCents: safeCentsNumber(line.creditCents),
  }));
}

export function expandJournalLinesExact(entry: BalanceEntry) {
  const gross = exactCents(entry.amount);
  if (!hasVatSplit(entry)) {
    const lines: Array<{ account: number; debitCents: bigint; creditCents: bigint }> = [];
    if (entry.debitAccount != null) {
      lines.push({ account: entry.debitAccount, debitCents: gross, creditCents: 0n });
    }
    if (entry.creditAccount != null) {
      lines.push({ account: entry.creditAccount, debitCents: 0n, creditCents: gross });
    }
    return lines;
  }

  const vat = exactCents(entry.vatAmount!);
  const net = entry.amountExVat == null ? gross - vat : exactCents(entry.amountExVat);
  const side = vatPostingSide(entry.vatAccount!)!;
  const lines: Array<{ account: number; debitCents: bigint; creditCents: bigint }> = [];
  if (side === "debit") {
    if (entry.debitAccount != null) {
      lines.push({ account: entry.debitAccount, debitCents: net, creditCents: 0n });
    }
    lines.push({ account: entry.vatAccount!, debitCents: vat, creditCents: 0n });
    if (entry.creditAccount != null) {
      lines.push({ account: entry.creditAccount, debitCents: 0n, creditCents: gross });
    }
  } else {
    if (entry.debitAccount != null) {
      lines.push({ account: entry.debitAccount, debitCents: gross, creditCents: 0n });
    }
    if (entry.creditAccount != null) {
      lines.push({ account: entry.creditAccount, debitCents: 0n, creditCents: net });
    }
    lines.push({ account: entry.vatAccount!, debitCents: 0n, creditCents: vat });
  }
  return lines;
}

/** Result-account amount: ex VAT when the entry carries a VAT split, otherwise the header amount. */
export function resultLegCents(entry: BalanceEntry) {
  if (!hasVatSplit(entry)) return moneyToCents(entry.amount);
  if (entry.amountExVat == null) return safeCentsNumber(exactCents(entry.amount) - exactCents(entry.vatAmount!));
  return moneyToCents(entry.amountExVat);
}

export type VatReportCents = {
  /** Utgående moms, credit minus debit, in cents. */
  outputCents: number;
  /** Ingående moms, debit minus credit, in cents. */
  inputCents: number;
  /** Output minus input. Negative means VAT to reclaim. */
  payableCents: number;
};

/** Momsrapport from the same journal lines as the account balances. */
export function vatReportCents(entries: BalanceEntry[]): VatReportCents {
  let outputCents = 0;
  let inputCents = 0;
  for (const entry of entries) {
    for (const line of expandJournalLines(entry)) {
      if (line.account >= 2610 && line.account <= 2639) {
        outputCents = addCents(outputCents, line.creditCents - line.debitCents);
      } else if (line.account >= 2640 && line.account <= 2649) {
        inputCents = addCents(inputCents, line.debitCents - line.creditCents);
      }
    }
  }
  return { outputCents, inputCents, payableCents: addCents(outputCents, -inputCents) };
}

export type AccountBalances = {
  companyAccountCents: number;
  capitalInsuranceCents: number;
  asOf: string | null;
};

export type SelectedAccountBalance = {
  account: number;
  balanceCents: number;
  debitCents: number;
  creditCents: number;
  entryCount: number;
};

function moneyToCents(value: MoneyLike | null | undefined) {
  if (value == null) return 0;
  return safeCentsNumber(exactCents(value));
}

function addCents(left: number, right: number) {
  return safeCentsNumber(BigInt(left) + BigInt(right));
}

function ledgerDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const normalized = value instanceof Date ? value.toISOString() : String(value);
  const date = normalized.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function calculateAccountBalances(entries: BalanceEntry[]): AccountBalances {
  let companyAccountCents = 0;
  let capitalInsuranceCents = 0;
  let asOf: string | null = null;

  for (const entry of entries) {
    for (const line of expandJournalLines(entry)) {
      const signed = line.debitCents - line.creditCents;
      if (line.account === 1930) companyAccountCents = addCents(companyAccountCents, signed);
      if (line.account === 1385) capitalInsuranceCents = addCents(capitalInsuranceCents, signed);
    }

    const date = ledgerDate(entry.date);
    if (date && (!asOf || date > asOf)) asOf = date;
  }

  return { companyAccountCents, capitalInsuranceCents, asOf };
}

export function centsToMoney(cents: number) {
  return formatCents(BigInt(safeCentsNumber(BigInt(cents))));
}

export function calculateSelectedAccountBalances(
  entries: BalanceEntry[],
  accounts: number[],
) {
  const selected = new Map<number, SelectedAccountBalance>();
  for (const account of accounts) {
    selected.set(account, {
      account,
      balanceCents: 0,
      debitCents: 0,
      creditCents: 0,
      entryCount: 0,
    });
  }
  let asOf: string | null = null;

  for (const entry of entries) {
    const touched = new Set<number>();
    for (const line of expandJournalLines(entry)) {
      const balance = selected.get(line.account);
      if (!balance) continue;
      balance.debitCents = addCents(balance.debitCents, line.debitCents);
      balance.creditCents = addCents(balance.creditCents, line.creditCents);
      balance.balanceCents = addCents(balance.balanceCents, line.debitCents - line.creditCents);
      touched.add(line.account);
    }
    for (const account of touched) selected.get(account)!.entryCount += 1;

    const date = ledgerDate(entry.date);
    if (date && touched.size > 0 && (!asOf || date > asOf)) asOf = date;
  }

  return { balances: [...selected.values()], asOf };
}
