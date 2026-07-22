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
  receiptRequired: boolean;
  version?: number | null;
  documentCount: number;
  documents: AccountingDocument[];
};

export type DashboardSummary = {
  income: number;
  expenses: number;
  result: number;
  balance: number | null;
  companyAccountBalance: number;
  capitalInsuranceBalance: number;
  accountBalancesAsOf?: string | null;
  debt: number;
  missingReceiptCount: number;
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

export type AgentStep = {
  id: string;
  label: string;
  detail?: string;
  status: "running" | "done" | "error";
  summary?: string;
};

export type AgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool-start"; callId: string; name: string; label: string; detail?: string }
  | { type: "tool-end"; callId: string; name: string; ok: boolean; summary?: string }
  | { type: "text-delta"; text: string };

export type GmailAccount = {
  id: string;
  email: string;
  status: string;
  lastUsedAt: string | null;
  connectedAt: string;
};

export type AgentGmailAttachment = {
  document: AccountingDocument;
  entryId: string;
  account: string;
  explanation: string;
};

export type AccountingAgentMessage = {
  role: "user" | "assistant";
  content: string;
  steps?: AgentStep[];
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
  gmailAttachments: AgentGmailAttachment[];
  draft: AccountingDraft | null;
  proposal: AccountingAgentProposal | null;
};

export type AppTab = "home" | "ledger" | "add" | "chat" | "settings";

export type AiModelId = "gpt-5.6-sol" | "gpt-5.6-terra" | "gpt-5.6-luna";

export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export type AiSettings = {
  model: AiModelId;
  reasoningEffort: AiReasoningEffort;
};
