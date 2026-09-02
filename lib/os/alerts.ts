import { daysUntil } from "./format";
import type { AlertRow, LedgerSnapshot, ProjectRow, UpcomingRow } from "./types";

export function buildAlerts(input: {
  ledger: LedgerSnapshot | null;
  projects: ProjectRow[];
  upcoming: UpcomingRow[];
  nowYmd: string;
  vaultBase: string;
}): AlertRow[] {
  const alerts: AlertRow[] = [];
  const { ledger, projects, upcoming, nowYmd, vaultBase } = input;

  if (ledger?.missingReceiptCount) {
    alerts.push({
      id: "receipts-missing",
      title: "Receipts missing",
      detail: `${ledger.missingReceiptCount} booked expenses still need documents`,
      href: `${vaultBase}?filter=missing`,
      tone: "warn",
    });
  }

  if (ledger && ledger.pendingDraftCount > 0) {
    alerts.push({
      id: "ai-drafts",
      title: "AI drafts waiting",
      detail: `${ledger.pendingDraftCount} unapproved suggestions in the vault`,
      href: vaultBase,
      tone: "brand",
    });
  }

  if (ledger && ledger.bankCents < 0) {
    alerts.push({
      id: "bank-negative",
      title: "Company account below zero",
      detail: "Konto 1930 booked balance is negative",
      href: `${vaultBase}`,
      tone: "warn",
    });
  } else if (ledger && ledger.cashAfterTaxCents < 0) {
    alerts.push({
      id: "cash-tight",
      title: "Booked cash does not cover estimated tax",
      detail: "1930 minus VAT payable and 20.6% of YTD result is below zero",
      tone: "warn",
    });
  }

  const vatSoon = upcoming.find((item) => item.kind === "tax" && item.title.startsWith("VAT"));
  if (vatSoon) {
    const days = daysUntil(nowYmd, vatSoon.date);
    if (days != null && days <= 21) {
      alerts.push({
        id: `vat-${vatSoon.date}`,
        title: "VAT approaching",
        detail: vatSoon.detail,
        tone: "warn",
      });
    }
  }

  for (const project of projects) {
    if (!project.lastActivity) continue;
    const days = daysUntil(project.lastActivity.slice(0, 10), nowYmd);
    if (days != null && days >= 14) {
      alerts.push({
        id: `stale-${project.repo ?? project.name}`,
        title: `${project.name} untouched 14d`,
        detail: `Last GitHub activity ${project.lastActivity.slice(0, 10)}`,
        href: project.repoUrl ?? undefined,
        tone: "muted",
      });
    }
  }

  return alerts.slice(0, 16);
}
