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
  bankCents: number;
  kfCents: number;
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
  incomeLastMonthCents: number;
  incomeYtdCents: number;
  expenseMonthCents: number;
  expenseLastMonthCents: number;
  expenseYtdCents: number;
  profitMonthCents: number;
  profitLastMonthCents: number;
  profitYtdCents: number;
  lastMonth: string;
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
  afterTaxYtdCents: number;
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
  expenses: LedgerEntryRow[];
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

export type SpotifyHistorySong = {
  name: string;
  id: string;
  streams: number;
  category: string;
};

export type SpotifyHistory = {
  source: string;
  kind: string;
  scrapedAt: string;
  artistId: string;
  from: string;
  to: string;
  totalStreams: number;
  last7: number;
  last30: number;
  ownStreams: number;
  labelStreams: number;
  months: Array<{ month: string; streams: number }>;
  daily: Array<{ date: string; streams: number }>;
  top: SpotifyHistorySong[];
  distrokid: {
    scrapedAt: string;
    totalEarnedUsd: number;
    balanceUsd: number;
  };
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
  spotifyHistory: SpotifyHistory;
  connect: ConnectBlock[];
};
