import { createHash, timingSafeEqual } from "node:crypto";

export function getTradingAccessKey() {
  return process.env.TRADING_ACCESS_KEY?.trim() || process.env.ACCOUNTING_ACCESS_KEY?.trim() || "";
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function tradingAccessKeyMatches(candidate: string) {
  const expected = getTradingAccessKey();
  if (!expected || !candidate) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}
