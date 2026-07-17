export type AccountingDocument = {
  id?: string;
  name?: string;
  originalName?: string;
  fileName?: string;
  url?: string;
  downloadUrl?: string;
  contentType?: string;
  mimeType?: string;
  size?: number;
  byteSize?: number;
  version?: number;
};

export type AccountingEntry = {
  id: string;
  legacyId?: string | null;
  date: string;
  description: string;
  debitName?: string | null;
  debitAccount?: string | number | null;
  creditName?: string | null;
  creditAccount?: string | number | null;
  beloppExMoms?: number | string | null;
  moms?: number | string | null;
  momsAccount?: string | number | null;
  amount: number;
  type?: string | null;
  source?: string | null;
  notes?: string | null;
  status?: string | null;
  version?: number | null;
  documents: AccountingDocument[];
};

export type DashboardSummary = {
  income: number;
  expenses: number;
  result: number;
  balance: number | null;
  vat: number;
  entryCount: number;
  receiptCount: number;
};

export type BackupStatus = {
  lastAt?: string | null;
  status?: string | null;
};

export type DashboardData = {
  summary: DashboardSummary;
  recentEntries: AccountingEntry[];
  backup?: BackupStatus | null;
};

export type DraftEntry = Omit<AccountingEntry, "documents"> & {
  documents?: AccountingDocument[];
  sourceDocumentIndexes?: number[];
  reasoning?: string | null;
  confidence?: number | null;
};

export type AccountingAccount = {
  id: string;
  legacyId?: number | null;
  account: number;
  name: string;
  category?: string | null;
  version: number;
};

export type AccountingRevision = {
  id: string;
  entryId: string;
  version: number;
  action: string;
  actor?: string | null;
  snapshot?: Record<string, unknown> | null;
  createdAt: string;
};

export type AccountingDraft = {
  id: string;
  status?: string;
  entries: DraftEntry[];
  warnings: string[];
  manual?: boolean;
};

export type AccountingAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AccountingAgentProposalEdit = {
  id: string;
  version: number;
  current: AccountingEntry;
  proposed: AccountingEntry;
  explanation: string;
};

export type AccountingAgentProposalDelete = {
  id: string;
  version: number;
  current: AccountingEntry;
  explanation: string;
};

export type AccountingAgentProposal = {
  token: string;
  expiresAt: string;
  edits: AccountingAgentProposalEdit[];
  deletes: AccountingAgentProposalDelete[];
};

export type AccountingAgentResult = {
  message: string;
  model: string;
  tools: Array<{ name: string; label: string }>;
  referencedEntries: AccountingEntry[];
  draft: AccountingDraft | null;
  proposal: AccountingAgentProposal | null;
};

export type AppTab = "home" | "add" | "ledger" | "settings";
