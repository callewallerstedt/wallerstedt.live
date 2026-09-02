import { daysUntil } from "./format";
import type { ActionItem, LedgerSnapshot, UpcomingRow } from "./types";

const TONE_RANK: Record<ActionItem["tone"], number> = { warn: 0, brand: 1, muted: 2 };

/**
 * Everything the dashboard can work out on its own that deserves the owner's
 * attention, in the order it should be dealt with. Manual to-dos live beside
 * these on the Tasks page but are stored, not derived.
 */
export function buildActions(input: {
  ledger: LedgerSnapshot | null;
  upcoming: UpcomingRow[];
  nowYmd: string;
  vaultBase: string;
}): ActionItem[] {
  const { ledger, upcoming, nowYmd, vaultBase } = input;
  const items: ActionItem[] = [];

  if (ledger?.pendingDraftCount) {
    items.push({
      id: "drafts",
      title: `Approve ${ledger.pendingDraftCount} AI draft${ledger.pendingDraftCount === 1 ? "" : "s"}`,
      detail: "Suggested entries are waiting in Bokföring and are not booked yet",
      href: vaultBase,
      date: null,
      tone: "brand",
      source: "drafts",
    });
  }

  if (ledger?.missingReceiptCount) {
    items.push({
      id: "receipts",
      title: `Attach ${ledger.missingReceiptCount} missing receipt${ledger.missingReceiptCount === 1 ? "" : "s"}`,
      detail: "Booked expenses without a document — Skatteverket requires the underlag",
      href: `${vaultBase}?filter=missing`,
      date: null,
      tone: "warn",
      source: "receipts",
    });
  }

  for (const item of upcoming.filter((row) => row.kind === "tax")) {
    const days = daysUntil(nowYmd, item.date);
    if (days == null || days > 30) continue;
    items.push({
      id: `tax-${item.id}`,
      title: item.title,
      detail: days <= 0 ? "Due today or overdue" : `Due in ${days} day${days === 1 ? "" : "s"}`,
      href: null,
      date: item.date,
      tone: days <= 7 ? "warn" : "muted",
      source: "tax",
    });
  }

  if (ledger && ledger.bankCents < 0) {
    items.push({
      id: "bank-negative",
      title: "Company account is booked below zero",
      detail: "Konto 1930 has a negative balance in the books",
      href: vaultBase,
      date: null,
      tone: "warn",
      source: "cash",
    });
  } else if (ledger && ledger.cashAfterTaxCents < 0) {
    items.push({
      id: "cash-tight",
      title: "Cash does not cover the tax set-aside",
      detail: "1930 minus VAT payable and 20.6% of the YTD result is negative",
      href: null,
      date: null,
      tone: "warn",
      source: "cash",
    });
  }

  for (const item of upcoming.filter((row) => row.kind === "release")) {
    const days = daysUntil(nowYmd, item.date);
    if (days == null || days > 21 || days < 0) continue;
    items.push({
      id: `release-${item.id}`,
      title: `${item.title} releases in ${days} day${days === 1 ? "" : "s"}`,
      detail: item.detail,
      href: item.href ?? null,
      date: item.date,
      tone: "brand",
      source: "release",
    });
  }

  return items.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]).slice(0, 20);
}
