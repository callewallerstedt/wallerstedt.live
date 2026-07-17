import { upload } from "@vercel/blob/client";
import type {
  AccountingDocument,
  AccountingDraft,
  AccountingAccount,
  AccountingEntry,
  AccountingRevision,
  BackupStatus,
  DashboardData,
  DashboardSummary,
  DraftEntry,
} from "./types";

export type AccountingUploadProgress = {
  fileName: string;
  fileIndex: number;
  fileCount: number;
  filePercentage: number;
  overallPercentage: number;
  phase: "preparing" | "uploading" | "finalizing" | "analyzing";
};

export class AccountingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AccountingApiError";
    this.status = status;
  }
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function asOptionalString(value: unknown): string | null {
  const normalized = asString(value).trim();
  return normalized || null;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return fallback;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDocument(value: unknown): AccountingDocument {
  const record = asRecord(value);
  return {
    id: asOptionalString(record.id) ?? undefined,
    name: asOptionalString(record.name ?? record.originalName) ?? undefined,
    originalName: asOptionalString(record.originalName ?? record.name) ?? undefined,
    fileName: asOptionalString(record.fileName ?? record.filename) ?? undefined,
    url: asOptionalString(record.url) ?? undefined,
    downloadUrl: asOptionalString(record.downloadUrl ?? record.download_url) ?? undefined,
    contentType: asOptionalString(record.contentType ?? record.content_type) ?? undefined,
    mimeType: asOptionalString(record.mimeType ?? record.mime_type) ?? undefined,
    size: (record.size ?? record.byteSize) == null ? undefined : asNumber(record.size ?? record.byteSize),
    byteSize: (record.byteSize ?? record.size) == null ? undefined : asNumber(record.byteSize ?? record.size),
    version: record.version == null ? undefined : asNumber(record.version),
  };
}

function safeBlobFilename(file: File) {
  const name = file.name;
  const leaf = name.replace(/\\/g, "/").split("/").pop() || "underlag";
  const safe = leaf
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "underlag";
  if (/\.(pdf|jpe?g|png|txt|csv)$/i.test(safe)) return safe;
  const extension = file.type === "application/pdf"
    ? ".pdf"
    : file.type === "image/png"
      ? ".png"
      : file.type === "text/plain"
        ? ".txt"
        : ["text/csv", "application/csv", "application/vnd.ms-excel"].includes(file.type)
          ? ".csv"
          : ".jpg";
  return `${safe}${extension}`;
}

function randomUploadId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function sha256(file: File) {
  if (!globalThis.crypto?.subtle) {
    throw new AccountingApiError("Den här webbläsaren kan inte verifiera filen säkert. Uppdatera webbläsaren och försök igen.", 0);
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeEntry(value: unknown, index = 0): AccountingEntry {
  const record = asRecord(value);
  const amount = asNumber(record.amount ?? record.belopp ?? record.total ?? record.sum);
  return {
    id: asString(record.id ?? record.entryId ?? record.legacyId, `post-${index + 1}`),
    legacyId: asOptionalString(record.legacyId ?? record.legacy_id),
    date: asString(record.date ?? record.datum).slice(0, 10),
    description: asString(record.description ?? record.beskrivning ?? record.text, "Bokföringspost"),
    debitName: asOptionalString(record.debitName ?? record.debit_name ?? record.debetNamn),
    debitAccount: asOptionalString(record.debitAccount ?? record.debit_account ?? record.debetkonto),
    creditName: asOptionalString(record.creditName ?? record.credit_name ?? record.kreditNamn),
    creditAccount: asOptionalString(record.creditAccount ?? record.credit_account ?? record.kreditkonto),
    beloppExMoms: (record.beloppExMoms ?? record.belopp_ex_moms ?? record.amountExVat) == null
      ? null
      : asNumber(record.beloppExMoms ?? record.belopp_ex_moms ?? record.amountExVat),
    moms: (record.moms ?? record.vatAmount) == null ? null : asNumber(record.moms ?? record.vatAmount),
    momsAccount: asOptionalString(record.momsAccount ?? record.moms_account ?? record.momskonto ?? record.vatAccount),
    amount,
    type: asOptionalString(record.type ?? record.typ),
    source: asOptionalString(record.source ?? record.kalla),
    notes: asOptionalString(record.notes ?? record.note ?? record.anteckningar),
    status: asOptionalString(record.status),
    version: record.version == null ? null : asNumber(record.version),
    documents: asArray(record.documents ?? record.attachments ?? record.files).map(normalizeDocument),
  };
}

export function normalizeDashboard(value: unknown): DashboardData {
  const root = asRecord(value);
  const summaryRecord = asRecord(root.summary ?? root.dashboard ?? root.totals);
  const summary: DashboardSummary = {
    income: asNumber(summaryRecord.income ?? summaryRecord.intakter),
    expenses: asNumber(summaryRecord.expenses ?? summaryRecord.kostnader),
    result: asNumber(summaryRecord.result ?? summaryRecord.profit),
    balance: (summaryRecord.balance ?? summaryRecord.saldo) == null ? null : asNumber(summaryRecord.balance ?? summaryRecord.saldo),
    vat: asNumber(summaryRecord.vat ?? summaryRecord.moms),
    entryCount: asNumber(summaryRecord.entryCount ?? summaryRecord.entries ?? summaryRecord.antalPoster ?? root.entryCount),
    receiptCount: asNumber(summaryRecord.receiptCount ?? summaryRecord.receipts ?? summaryRecord.antalKvitton ?? root.documentCount),
  };
  const backupRecord = asRecord(root.backup ?? root.latestBackup);
  const backup: BackupStatus | null = Object.keys(backupRecord).length > 0
    ? {
        lastAt: asOptionalString(backupRecord.lastAt ?? backupRecord.last_at ?? backupRecord.createdAt),
        status: asOptionalString(backupRecord.status) ?? "ok",
      }
    : null;
  return {
    summary,
    recentEntries: asArray(root.recentEntries ?? root.recent ?? root.entries).map(normalizeEntry),
    backup,
  };
}

function normalizeDraftEntry(value: unknown, index: number): DraftEntry {
  const record = asRecord(value);
  return {
    ...normalizeEntry(value, index),
    sourceDocumentIndexes: asArray(record.sourceDocumentIndexes)
      .map((item) => asNumber(item, -1))
      .filter((item) => Number.isInteger(item) && item >= 0),
    reasoning: asOptionalString(record.reasoning),
    confidence: record.confidence == null ? null : asNumber(record.confidence),
  };
}

function normalizeAccount(value: unknown): AccountingAccount {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    legacyId: record.legacyId == null ? null : asNumber(record.legacyId),
    account: asNumber(record.account),
    name: asString(record.name),
    category: asOptionalString(record.category),
    version: asNumber(record.version, 1),
  };
}

export function normalizeDraft(value: unknown): AccountingDraft {
  const root = asRecord(value);
  const draftRecord = asRecord(root.draft ?? value);
  const extracted = asRecord(draftRecord.extracted);
  const entries = asArray(draftRecord.entries ?? draftRecord.entry ?? extracted.entries ?? root.entries).map(normalizeDraftEntry);
  return {
    id: asString(draftRecord.id ?? root.draftId ?? root.id, `draft-${Date.now()}`),
    status: asOptionalString(draftRecord.status) ?? undefined,
    entries,
    warnings: asArray(draftRecord.warnings ?? extracted.warnings ?? root.warnings).map((warning) => asString(warning)).filter(Boolean),
  };
}

function getErrorMessage(payload: unknown, status: number): string {
  const record = asRecord(payload);
  const nestedError = asRecord(record.error);
  const message = asString(record.message) || asString(record.error) || asString(nestedError.message);
  if (message) return message;
  if (status === 401) return "Lösenordet är fel eller sessionen har gått ut.";
  if (status === 403) return "Du har inte behörighet till den här resursen.";
  if (status === 404) return "Resursen kunde inte hittas.";
  if (status === 413) return "Filerna är för stora. Prova färre eller mindre filer.";
  if (status === 409) return "Uppgiften har ändrats på en annan enhet. Uppdatera sidan och försök igen.";
  if (status === 429) return "För många försök. Vänta en stund och försök igen.";
  if (status >= 500) return "Tjänsten svarar inte just nu. Inget har sparats – försök igen.";
  return "Något gick fel. Kontrollera uppgifterna och försök igen.";
}

export class AccountingApi {
  private readonly baseUrl: string;

  constructor(accessKey: string) {
    this.baseUrl = `/api/accounting/${encodeURIComponent(accessKey)}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...init.headers,
        },
      });
    } catch {
      throw new AccountingApiError("Kunde inte nå servern. Kontrollera anslutningen och försök igen.", 0);
    }

    let payload: unknown = null;
    const contentType = response.headers.get("content-type") ?? "";
    try {
      payload = contentType.includes("application/json") ? await response.json() : await response.text();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new AccountingApiError(getErrorMessage(payload, response.status), response.status);
    }
    return payload as T;
  }

  async session(): Promise<boolean> {
    let payload: unknown;
    try {
      payload = await this.request<unknown>("/session");
    } catch (error) {
      if (!(error instanceof AccountingApiError) || ![404, 405].includes(error.status)) throw error;
      payload = await this.request<unknown>("/session/status");
    }
    const record = asRecord(payload);
    return record.authenticated === true || asRecord(record.session).authenticated === true;
  }

  async login(password: string): Promise<boolean> {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    };
    let payload: unknown;
    try {
      payload = await this.request<unknown>("/session", init);
    } catch (error) {
      if (!(error instanceof AccountingApiError) || ![404, 405].includes(error.status)) throw error;
      payload = await this.request<unknown>("/session/login", init);
    }
    const record = asRecord(payload);
    return record.authenticated === true || record.ok === true;
  }

  async logout(allDevices = false): Promise<void> {
    const suffix = allDevices ? "?scope=all" : "";
    try {
      await this.request(`/session${suffix}`, { method: "DELETE" });
    } catch (error) {
      if (!(error instanceof AccountingApiError) || ![404, 405].includes(error.status)) throw error;
      if (allDevices) throw error;
      await this.request("/session/logout", { method: "POST" });
    }
  }

  async dashboard(): Promise<DashboardData> {
    return normalizeDashboard(await this.request("/dashboard"));
  }

  async entries(query = ""): Promise<{ entries: AccountingEntry[]; total: number }> {
    const parameters = new URLSearchParams(query);
    parameters.set("limit", "250");
    parameters.set("page", "1");
    const firstPayload = await this.request<unknown>(`/entries?${parameters.toString()}`);
    const firstRecord = asRecord(firstPayload);
    const entries = asArray(firstRecord.entries ?? firstRecord.items ?? firstPayload).map(normalizeEntry);
    const total = asNumber(firstRecord.total, entries.length);
    const pageCount = Math.min(Math.ceil(total / 250), 40);
    if (pageCount > 1) {
      const remaining = await Promise.all(Array.from({ length: pageCount - 1 }, async (_, index) => {
        const pageParameters = new URLSearchParams(parameters);
        pageParameters.set("page", String(index + 2));
        const payload = await this.request<unknown>(`/entries?${pageParameters.toString()}`);
        const record = asRecord(payload);
        return asArray(record.entries ?? record.items ?? payload).map(normalizeEntry);
      }));
      remaining.forEach((page) => entries.push(...page));
    }
    return { entries, total };
  }

  async entry(id: string): Promise<AccountingEntry> {
    const payload = await this.request<unknown>(`/entries/${encodeURIComponent(id)}`);
    const record = asRecord(payload);
    return normalizeEntry(record.entry ?? payload);
  }

  async createEntry(entry: Partial<AccountingEntry>): Promise<AccountingEntry> {
    const payload = await this.request<unknown>("/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    const record = asRecord(payload);
    return normalizeEntry(record.entry ?? payload);
  }

  async updateEntry(id: string, entry: Partial<AccountingEntry>): Promise<AccountingEntry> {
    const payload = await this.request<unknown>(`/entries/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    const record = asRecord(payload);
    return normalizeEntry(record.entry ?? payload);
  }

  async deleteEntry(id: string, version?: number | null): Promise<void> {
    await this.request(`/entries/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: version ?? undefined }),
    });
  }

  async revisions(id: string): Promise<AccountingRevision[]> {
    const payload = await this.request<unknown>(`/entries/${encodeURIComponent(id)}/revisions`);
    const record = asRecord(payload);
    return asArray(record.revisions ?? payload).map((value) => {
      const revision = asRecord(value);
      return {
        id: asString(revision.id),
        entryId: asString(revision.entryId),
        version: asNumber(revision.version),
        action: asString(revision.action, "update"),
        actor: asOptionalString(revision.actor),
        snapshot: Object.keys(asRecord(revision.snapshot)).length ? asRecord(revision.snapshot) : null,
        createdAt: asString(revision.createdAt),
      };
    });
  }

  async deleteDocument(id: string, version: number): Promise<void> {
    await this.request(`/documents/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
  }

  async accounts(): Promise<AccountingAccount[]> {
    const payload = await this.request<unknown>("/accounts");
    const record = asRecord(payload);
    return asArray(record.accounts ?? payload).map(normalizeAccount);
  }

  async createAccount(input: { account: number; name: string; category?: string | null }): Promise<AccountingAccount> {
    const payload = await this.request<unknown>("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const record = asRecord(payload);
    return normalizeAccount(record.account ?? payload);
  }

  async updateAccount(id: string, input: { account: number; name: string; category?: string | null; version: number }): Promise<AccountingAccount> {
    const payload = await this.request<unknown>(`/accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const record = asRecord(payload);
    return normalizeAccount(record.account ?? payload);
  }

  async deleteAccount(id: string, version: number): Promise<void> {
    await this.request(`/accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
  }

  async createBackup(): Promise<unknown> {
    return this.request("/backup", { method: "POST" });
  }

  private async finalizeUploadedDocument(file: File, blob: {
    pathname: string;
    url: string;
    downloadUrl: string;
    contentType: string;
    contentDisposition: string;
    etag?: string;
  }, entryId: string | null, checksum: string): Promise<AccountingDocument> {
    const body = JSON.stringify({
      entryId,
      originalName: file.name,
      mimeType: file.type || blob.contentType,
      byteSize: file.size,
      sha256: checksum,
      blob: {
        pathname: blob.pathname,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        etag: blob.etag ?? null,
      },
    });
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    };
    let payload: unknown;
    try {
      payload = await this.request<unknown>("/documents", init);
    } catch (error) {
      if (!(error instanceof AccountingApiError) || ![404, 405].includes(error.status)) throw error;
      payload = await this.request<unknown>("/documents/finalize", init);
    }
    const record = asRecord(payload);
    const document = normalizeDocument(record.document ?? payload);
    if (!document.id) throw new AccountingApiError("Underlaget laddades upp men kunde inte registreras. Försök igen.", 500);
    return document;
  }

  async uploadDocuments(
    files: File[],
    onProgress?: (progress: AccountingUploadProgress) => void,
    entryId: string | null = null,
  ): Promise<AccountingDocument[]> {
    if (files.length > 8) throw new AccountingApiError("Ladda upp högst 8 underlag åt gången.", 400);
    const tooLarge = files.find((file) => file.size > 10 * 1024 * 1024);
    if (tooLarge) throw new AccountingApiError(`${tooLarge.name} är större än 10 MB. Välj en mindre fil.`, 413);
    const unsupported = files.find((file) => !/\.(pdf|jpe?g|png|txt|csv)$/i.test(file.name)
      && !["application/pdf", "image/jpeg", "image/png", "text/plain", "text/csv", "application/csv"].includes(file.type));
    if (unsupported) throw new AccountingApiError(`${unsupported.name} har ett filformat som inte stöds. Använd PDF, JPG, PNG, TXT eller CSV.`, 415);
    const documents: AccountingDocument[] = [];
    const percentages = files.map(() => 0);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const pathname = `accounting-documents/${randomUploadId()}-${safeBlobFilename(file)}`;
      const report = (filePercentage: number, phase: AccountingUploadProgress["phase"] = "uploading") => {
        percentages[index] = Math.max(percentages[index], filePercentage);
        onProgress?.({
          fileName: file.name,
          fileIndex: index,
          fileCount: files.length,
          filePercentage,
          overallPercentage: Math.round(percentages.reduce((sum, value) => sum + value, 0) / files.length),
          phase,
        });
      };

      report(0, "preparing");
      const checksum = await sha256(file);
      const blob = await upload(pathname, file, {
        access: "private",
        handleUploadUrl: `${this.baseUrl}/documents/upload`,
        clientPayload: JSON.stringify({
          originalName: file.name,
          mimeType: file.type,
          byteSize: file.size,
          entryId,
        }),
        contentType: file.type || undefined,
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => report(Math.round(percentage)),
      });
      report(100, "finalizing");
      documents.push(await this.finalizeUploadedDocument(file, blob, entryId, checksum));
    }
    return documents;
  }

  async createDraft(
    text: string,
    files: File[],
    onProgress?: (progress: AccountingUploadProgress) => void,
  ): Promise<AccountingDraft> {
    const documents = files.length ? await this.uploadDocuments(files, onProgress) : [];
    const lastFile = files.at(-1)?.name ?? "Underlag";
    onProgress?.({
      fileName: lastFile,
      fileIndex: Math.max(files.length - 1, 0),
      fileCount: files.length,
      filePercentage: 100,
      overallPercentage: 100,
      phase: "analyzing",
    });
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.trim(),
        documentIds: documents.map((document) => document.id).filter(Boolean),
        ownedDocumentIds: documents.map((document) => document.id).filter(Boolean),
      }),
    };
    try {
      return normalizeDraft(await this.request("/ai/draft", init));
    } catch (error) {
      if (!(error instanceof AccountingApiError) || ![404, 405].includes(error.status)) throw error;
      return normalizeDraft(await this.request("/ai/drafts", init));
    }
  }

  async approveDraft(draft: AccountingDraft): Promise<AccountingEntry[]> {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: draft.entries.map((entry) => ({
          ...entry,
          debitAccount: entry.debitAccount ? asNumber(entry.debitAccount) : null,
          creditAccount: entry.creditAccount ? asNumber(entry.creditAccount) : null,
          momsAccount: entry.momsAccount ? asNumber(entry.momsAccount) : null,
          vatAccount: entry.momsAccount ? asNumber(entry.momsAccount) : null,
          amountExVat: entry.beloppExMoms,
          vatAmount: entry.moms,
        })),
      }),
    };
    let payload: unknown;
    try {
      payload = await this.request<unknown>(`/ai/draft/${encodeURIComponent(draft.id)}/approve`, init);
    } catch (error) {
      if (!(error instanceof AccountingApiError) || ![404, 405].includes(error.status)) throw error;
      payload = await this.request<unknown>(`/ai/drafts/${encodeURIComponent(draft.id)}/approve`, init);
    }
    const record = asRecord(payload);
    const rawEntries = record.entries ?? record.entry ?? payload;
    return (Array.isArray(rawEntries) ? rawEntries : [rawEntries]).filter(Boolean).map(normalizeEntry);
  }
}
