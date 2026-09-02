export type SourceId =
  | "ledger"
  | "spotify"
  | "tiktok"
  | "distrokid"
  | "avanza"
  | "bank"
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

export type TaskArea = "company" | "money" | "music" | "project" | "admin";

export type TaskRow = {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  priority: "low" | "normal" | "high";
  area: TaskArea;
  dueDate: string | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
};

/**
 * Something the dashboard derived that the owner should act on, as opposed to a
 * task they typed themselves. Always carries a link to where the work happens.
 */
export type ActionItem = {
  id: string;
  title: string;
  detail: string;
  href: string | null;
  date: string | null;
  tone: "warn" | "brand" | "muted";
  source: "receipts" | "drafts" | "tax" | "cash" | "release";
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
  avgDaily: number;
};

export type SpotifyHistory = {
  source: string;
  kind: string;
  pulledVia: string;
  scrapedAt: string;
  artistId: string;
  from: string;
  to: string;
  throughLabel: string;
  totalStreams: number;
  ownStreams: number;
  labelStreams: number;
  lastCompleteDay: string;
  lastCompleteOwn: number;
  last7Own: number;
  last30Own: number;
  last7: number;
  last30: number;
  ratePerStreamUsd: number;
  estimatedOwnEarningsUsd: number;
  months: Array<{ month: string; own: number; label: number; total: number }>;
  daily: Array<{ date: string; own: number; label: number }>;
  top: SpotifyHistorySong[];
  memories: {
    name: string;
    id: string;
    streams: number;
    firstDayStreams: number;
    avgDaily: number;
    from: string;
    to: string;
    category: string;
  };
  distrokid: {
    scrapedAt: string;
    generated: string;
    totalEarnedUsd: number;
    balanceUsd: number;
    spotifyQty: number;
    spotifyEarnUsd: number;
    stores: Array<{ store: string; qty: number; earnUsd: number }>;
  };
  csvVerified: {
    source: string;
    matches: string;
    from: string;
    to: string;
    days: number;
    ownTotal: number;
    ownLastDay: number;
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
  releases: ReleaseRow[];
  actions: ActionItem[];
  tasks: TaskRow[];
  tasksError: string | null;
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
