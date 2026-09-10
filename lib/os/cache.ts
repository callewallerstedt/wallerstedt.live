import { revalidateTag } from "next/cache";

export const OS_LEDGER_CACHE_TAG = "os-ledger";

/** Drop the overview/money ledger snapshot after a booked entry changes. */
export function invalidateOsLedgerCache() {
  try {
    revalidateTag(OS_LEDGER_CACHE_TAG, "max");
  } catch {
    // Scripts and unit tests are not inside a Next.js request.
  }
}
