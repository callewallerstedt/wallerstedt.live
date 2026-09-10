import type { OsPageSlug } from "./route";
import type { LedgerSnapshot } from "./types";

export type OsSnapshotKind =
  | "overview"
  | "tasks"
  | "tiktok"
  | "money"
  | "music"
  | "settings"
  | "vault";

/** Which data a tab actually needs — used to skip the ledger on TikTok/settings. */
export function osSnapshotKind(page: OsPageSlug): OsSnapshotKind {
  switch (page) {
    case "music":
      return "music";
    case "money":
      return "money";
    case "tiktok":
      return "tiktok";
    case "settings":
      return "settings";
    case "vault":
      return "vault";
    case "tasks":
      return "tasks";
    default:
      return "overview";
  }
}

/**
 * The full ledger snapshot includes every expense row for tests and action
 * builders. The phone never renders those lists on Overview, so drop them
 * before they ride the RSC payload.
 */
export function publishLedger(
  ledger: LedgerSnapshot,
  detail: "overview" | "money",
): LedgerSnapshot {
  if (detail === "overview") {
    return {
      ...ledger,
      expenses: [],
      accountNames: {},
      categories: [],
      recurring: [],
      counterparties: [],
      largestExpenses: [],
      missingReceipts: [],
      recent: ledger.recent.slice(0, 8),
    };
  }
  return {
    ...ledger,
    expenses: [],
    accountNames: {},
  };
}
