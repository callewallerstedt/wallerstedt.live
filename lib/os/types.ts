export type SourceId =
  | "ledger"
  | "spotify"
  | "tiktok"
  | "distrokid"
  | "avanza"
  | "bank"
  | "github"
  | "vercel"
  | "wealth";

export type SourceState = {
  id: SourceId;
  label: string;
  wired: boolean;
  detail: string;
};

export type LedgerEntryRow = {
  id: string;
  date: string | null;
  description: string;
  debitAccount: number | null;
  creditAccount: number | null;
  debitName: string | null;
  creditName: string | null;
  amountCents: number;
  vatCents: number;
  type: string;
  kind: "income" | "expense" | "debt" | "other";
  receiptRequired: boolean;
  documentCount: number;
  missingReceipt: boolean;
};

export type MonthPoint = {
  month: string;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
};

export type CategoryRow = {
  key: string;
  label: string;
  account: number | null;
  cents: number;
  count: number;
};

export type RecurringRow = {
  label: string;
  months: number;
  lastCents: number;
  lastDate: string | null;
  totalCents: number;
};

export type CounterpartyRow = {
  name: string;
  cents: number;
  count: number;
  lastDate: string | null;
};

export type LedgerSnapshot = {
  asOf: string | null;
  generatedOn: string;
  year: string;
  month: string;
  incomeMonthCents: number;
  incomeYtdCents: number;
  expenseMonthCents: number;
  expenseYtdCents: number;
  profitMonthCents: number;
  profitYtdCents: number;
  vatPayableCents: number;
  vatYtdCents: number;
  debtCents: number;
  bankCents: number;
  kfDepositedCents: number;
  ledgerAssetsCents: number;
  taxAccountCents: number | null;
  employerCents: number | null;
  withholdingCents: number | null;
  corpTaxBookedCents: number | null;
  corpTaxEstimateCents: number;
  cashAfterTaxCents: number;
  dividendCapacityCents: number;
  missingReceiptCount: number;
  pendingDraftCount: number;
  entryCount: number;
  months: MonthPoint[];
  recent: LedgerEntryRow[];
  missingReceipts: LedgerEntryRow[];
  largestExpenses: LedgerEntryRow[];
  categories: CategoryRow[];
  softwareCents: number;
  hardwareCents: number;
  adsCents: number;
  accountingCents: number;
  recurring: RecurringRow[];
  counterparties: CounterpartyRow[];
  accountNames: Record<number, string>;
};

export type ProjectRow = {
  name: string;
  status: string;
  currentTask: string | null;
  nextAction: string | null;
  repo: string | null;
  repoUrl: string | null;
  website: string | null;
  revenueCents: number | null;
  costCents: number | null;
  hours: number | null;
  notes: string | null;
  lastActivity: string | null;
  kind: "music" | "site" | "ai" | "client" | "other";
};

export type AlertRow = {
  id: string;
  title: string;
  detail: string;
  href?: string;
  tone: "brand" | "warn" | "muted";
};

export type UpcomingRow = {
  id: string;
  title: string;
  date: string;
  kind: "release" | "tax" | "invoice" | "meeting" | "subscription" | "project" | "purchase" | "task";
  detail: string;
  href?: string;
};

export type ReleaseRow = {
  title: string;
  date: string;
  slug: string;
  spotifyUrl: string | null;
  upcoming: boolean;
};

export type ConnectBlock = {
  source: SourceId;
  title: string;
  detail: string;
};

export type OsSnapshot = {
  company: {
    name: string;
    vat: string;
    owner: string;
  };
  sources: SourceState[];
  ledger: LedgerSnapshot | null;
  ledgerError: string | null;
  projects: ProjectRow[];
  projectsError: string | null;
  releases: ReleaseRow[];
  alerts: AlertRow[];
  upcoming: UpcomingRow[];
  wealth: {
    source: string;
    disclaimer: string;
    capitalCents: number;
    openPnlCents: number | null;
    positions: Array<{
      symbol: string;
      name: string;
      last: number;
      pnlPct: number | null;
      shares: number;
    }>;
    updatedAt: string | null;
  } | null;
  spotify: {
    followers: number | null;
    popularity: number | null;
    name: string | null;
  } | null;
  connect: ConnectBlock[];
};
