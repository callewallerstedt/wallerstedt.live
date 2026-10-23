import { AccountingError } from "./errors";

export type MoneyLike = number | string | { toString(): string };

/** Never round, coerce invalid money to zero, or pass database decimals through float. */
export function exactCents(value: MoneyLike): bigint {
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new AccountingError("Invalid monetary value.", 422, "invalid_money");
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

export function formatCents(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function safeCentsNumber(cents: bigint): number {
  const number = Number(cents);
  if (!Number.isSafeInteger(number)) {
    throw new AccountingError("Amount exceeds this numeric endpoint's precision. Use exact report strings.", 422, "money_out_of_range");
  }
  return number;
}
