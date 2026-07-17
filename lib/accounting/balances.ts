type MoneyLike = number | string | { toString(): string };

export type BalanceEntry = {
  amount: MoneyLike;
  debitAccount: number | null;
  creditAccount: number | null;
  date?: Date | string | null;
};

export type AccountBalances = {
  companyAccountCents: number;
  capitalInsuranceCents: number;
  asOf: string | null;
};

function moneyToCents(value: MoneyLike) {
  const parsed = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
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
    const amount = moneyToCents(entry.amount);

    if (entry.debitAccount === 1930) companyAccountCents += amount;
    if (entry.creditAccount === 1930) companyAccountCents -= amount;
    if (entry.debitAccount === 1385) capitalInsuranceCents += amount;
    if (entry.creditAccount === 1385) capitalInsuranceCents -= amount;

    const date = ledgerDate(entry.date);
    if (date && (!asOf || date > asOf)) asOf = date;
  }

  return { companyAccountCents, capitalInsuranceCents, asOf };
}

export function centsToMoney(cents: number) {
  return (cents / 100).toFixed(2);
}
