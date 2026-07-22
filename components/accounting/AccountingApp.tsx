"use client";

import Image from "next/image";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccountingApi, AccountingApiError, asNumber, type AccountingUploadProgress } from "./api";
import { AccountingIcons as Icon } from "./AccountingIcons";
import { PwaRegistration } from "./PwaRegistration";
import type {
  AccountingDocument,
  AccountingDraft,
  AccountingEntry,
  AccountingAccount,
  AccountingAgentMessage,
  AccountingAgentProposal,
  AccountingAgentResult,
  AccountingRevision,
  AgentStep,
  AiReasoningEffort,
  AiSettings,
  AppTab,
  DashboardData,
  DraftEntry,
  GmailAccount,
} from "./types";

type SessionStatus = "checking" | "authenticated" | "unauthenticated" | "error";

const AI_MODEL_OPTIONS = [
  { id: "gpt-5.6-sol", short: "Sol", label: "GPT-5.6 Sol", hint: "Smartast — bäst för svåra uppdrag" },
  { id: "gpt-5.6-terra", short: "Terra", label: "GPT-5.6 Terra", hint: "Balanserad för vardagsuppdrag" },
  { id: "gpt-5.6-luna", short: "Luna", label: "GPT-5.6 Luna", hint: "Snabbast och billigast" },
] as const;

const AI_EFFORT_OPTIONS = [
  { id: "none", label: "Ingen", hint: "Svarar direkt utan betänketid" },
  { id: "low", label: "Låg", hint: "Snabbt för enkla frågor" },
  { id: "medium", label: "Medel", hint: "Standard för de flesta uppdrag" },
  { id: "high", label: "Hög", hint: "Noggrannare sökning och analys" },
  { id: "xhigh", label: "Extra hög", hint: "Svåra uppdrag i flera steg" },
  { id: "max", label: "Max", hint: "Djupast tänkande — endast Sol" },
] as const;

const DEFAULT_AI_SETTINGS: AiSettings = { model: "gpt-5.6-sol", reasoningEffort: "medium" };
const AI_SETTINGS_STORAGE_KEY = "ac-ai-settings";

function isValidAiSettings(value: unknown): value is AiSettings {
  const record = value as { model?: unknown; reasoningEffort?: unknown } | null;
  return Boolean(
    record &&
    AI_MODEL_OPTIONS.some((option) => option.id === record.model) &&
    AI_EFFORT_OPTIONS.some((option) => option.id === record.reasoningEffort),
  );
}

const CLIPBOARD_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
  "text/csv": "csv",
};

async function readClipboardFiles(): Promise<File[]> {
  const clipboard = navigator.clipboard as Clipboard & { read?: () => Promise<ClipboardItems> };
  if (typeof clipboard?.read !== "function") {
    throw new Error("Webbläsaren stöder inte klistra in-knappen. Använd Välj filer i stället.");
  }
  let items: ClipboardItems;
  try {
    items = await clipboard.read();
  } catch {
    throw new Error("Åtkomst till urklipp nekades. Tillåt urklipp för sidan och försök igen.");
  }
  const files: File[] = [];
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  for (const item of items) {
    const type = Object.keys(CLIPBOARD_MIME_EXTENSIONS).find((candidate) => item.types.includes(candidate));
    if (!type) continue;
    const blob = await item.getType(type);
    if (!blob.size) continue;
    files.push(
      new File([blob], `urklipp-${stamp}-${files.length + 1}.${CLIPBOARD_MIME_EXTENSIONS[type]}`, { type }),
    );
  }
  if (!files.length) {
    throw new Error("Urklippet innehåller ingen bild eller fil. Kopiera t.ex. en skärmdump, bild eller PDF först.");
  }
  return files;
}

const currencyFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatCurrency(value: number | string | null | undefined) {
  return currencyFormatter.format(asNumber(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Datum saknas";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Inte rapporterad ännu";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function displayError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isUnauthorized(error: unknown) {
  return error instanceof AccountingApiError && error.status === 401;
}

function entryTypeLabel(entry: AccountingEntry) {
  const type = (entry.type ?? "").toLocaleLowerCase("sv-SE");
  if (type.includes("inkomst") || type.includes("inbetal") || type.includes("income") || type.includes("intäkt")) return "Intäkt";
  if (type.includes("utgift") || type.includes("utbetal") || type.includes("expense") || type.includes("kostnad")) return "Kostnad";
  if (type.includes("transfer") || type.includes("överför")) return "Överföring";
  return "Bokföringspost";
}

function entryTone(entry: AccountingEntry) {
  const type = canonicalEntryType(entry.type);
  if (type === "Inbetalning") return "income";
  if (type === "Utbetalning") return "expense";
  return "neutral";
}

function canonicalEntryType(value: string | null | undefined) {
  const type = (value ?? "").toLocaleLowerCase("sv-SE");
  if (type.includes("inbetal") || type.includes("inkomst") || type.includes("income") || type.includes("intäkt")) return "Inbetalning";
  if (type.includes("överför") || type.includes("transfer")) return "Överföring";
  if (type.includes("skuld") || type.includes("debt") || type.includes("other") || type.includes("övr")) return "Skuld";
  return "Utbetalning";
}

function revisionActionLabel(action: string) {
  const normalized = action.toLocaleLowerCase("sv-SE");
  if (normalized.includes("create")) return "Skapad";
  if (normalized.includes("delete")) return "Borttagen";
  if (normalized.includes("ai_approve")) return "AI-utkast godkänt";
  if (normalized.includes("import")) return "Importerad";
  return "Uppdaterad";
}

function documentName(document: AccountingDocument, index: number) {
  return document.name || document.originalName || document.fileName || `Underlag ${index + 1}`;
}

function documentUrl(document: AccountingDocument, accessKey: string) {
  const suppliedUrl = document.downloadUrl || document.url;
  const fallbackUrl = document.id
    ? `/api/accounting/${encodeURIComponent(accessKey)}/documents/${encodeURIComponent(document.id)}/download`
    : "";
  if (!suppliedUrl) return fallbackUrl;
  if (suppliedUrl.startsWith("http://") || suppliedUrl.startsWith("https://") || suppliedUrl.startsWith("/")) {
    return suppliedUrl;
  }
  return `/api/accounting/${encodeURIComponent(accessKey)}/${suppliedUrl.replace(/^\/+/, "")}`;
}

function isImageDocument(document: AccountingDocument) {
  const name = document.originalName || document.name || document.fileName || "";
  return (document.mimeType || document.contentType || "").startsWith("image/") || /\.(jpe?g|png)$/i.test(name);
}

function isPdfDocument(document: AccountingDocument) {
  const name = document.originalName || document.name || document.fileName || "";
  return (document.mimeType || document.contentType) === "application/pdf" || /\.pdf$/i.test(name);
}

function DocumentViewer({
  document,
  name,
  onClose,
  url,
}: {
  document: AccountingDocument;
  name: string;
  onClose: () => void;
  url: string;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; center: { x: number; y: number } } | null>(null);
  const image = isImageDocument(document);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const changeScale = useCallback((nextScale: number) => {
    setScale(Math.min(6, Math.max(1, nextScale)));
    if (nextScale <= 1) setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const previousOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = "hidden";
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div aria-label={`Förhandsvisning av ${name}`} aria-modal="true" className="ac-document-viewer" role="dialog">
      <div className="ac-document-viewer-toolbar">
        <strong>{name}</strong>
        <div>
          {image && (
            <>
              <button aria-label="Zooma ut" disabled={scale <= 1} onClick={() => changeScale(scale - 0.5)} type="button">−</button>
              <span>{Math.round(scale * 100)} %</span>
              <button aria-label="Zooma in" disabled={scale >= 6} onClick={() => changeScale(scale + 0.5)} type="button"><Icon.Plus size={18} /></button>
              <button aria-label="Återställ vy" onClick={resetView} type="button"><Icon.Refresh size={18} /></button>
            </>
          )}
          <a aria-label="Öppna originalfil" href={url} rel="noopener noreferrer" target="_blank"><Icon.Download size={18} /></a>
          <button aria-label="Stäng förhandsvisning" onClick={onClose} type="button"><Icon.Close size={20} /></button>
        </div>
      </div>
      {image ? (
        <div
          className={`ac-document-viewer-canvas ${scale > 1 ? "is-zoomed" : ""}`}
          onDoubleClick={() => scale > 1 ? resetView() : changeScale(2.5)}
          onPointerCancel={(event) => {
            pointers.current.delete(event.pointerId);
            gesture.current = null;
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            gesture.current = null;
          }}
          onPointerMove={(event) => {
            const previous = pointers.current.get(event.pointerId);
            if (!previous) return;
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const active = [...pointers.current.values()];
            if (active.length === 1 && scale > 1) {
              setOffset((current) => ({
                x: current.x + event.clientX - previous.x,
                y: current.y + event.clientY - previous.y,
              }));
              return;
            }
            if (active.length >= 2) {
              const [first, second] = active;
              const distance = Math.hypot(second.x - first.x, second.y - first.y);
              const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
              if (gesture.current) {
                changeScale(scale * (distance / Math.max(gesture.current.distance, 1)));
                setOffset((current) => ({
                  x: current.x + center.x - gesture.current!.center.x,
                  y: current.y + center.y - gesture.current!.center.y,
                }));
              }
              gesture.current = { distance, center };
            }
          }}
          onPointerUp={(event) => {
            pointers.current.delete(event.pointerId);
            gesture.current = null;
          }}
          onWheel={(event) => {
            event.preventDefault();
            changeScale(scale + (event.deltaY < 0 ? 0.35 : -0.35));
          }}
        >
          {/* Protected receipt URLs cannot use the server-side Next image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={name} draggable={false} src={url} style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }} />
        </div>
      ) : isPdfDocument(document) ? (
        <iframe className="ac-document-viewer-frame" src={url} title={name} />
      ) : (
        <iframe className="ac-document-viewer-frame" src={url} title={name} />
      )}
    </div>
  );
}

function createManualDraft(): AccountingDraft {
  return {
    id: `manual-${Date.now()}`,
    manual: true,
    warnings: [],
    entries: [{
      id: `new-${Date.now()}`,
      date: today(),
      description: "",
      debitName: "",
      debitAccount: "",
      creditName: "",
      creditAccount: "",
      beloppExMoms: null,
      moms: null,
      momsAccount: "",
      amount: 0,
      type: "Utbetalning",
      source: "manual",
      notes: "",
      status: "draft",
      receiptRequired: true,
      version: null,
      documentCount: 0,
      documents: [],
    }],
  };
}

function withoutReadOnlyFields(entry: DraftEntry | AccountingEntry) {
  return {
    date: entry.date,
    description: entry.description,
    debitName: entry.debitName || null,
    debitAccount: entry.debitAccount ? asNumber(entry.debitAccount) : null,
    creditName: entry.creditName || null,
    creditAccount: entry.creditAccount ? asNumber(entry.creditAccount) : null,
    beloppExMoms: entry.beloppExMoms == null ? null : asNumber(entry.beloppExMoms),
    moms: entry.moms == null ? null : asNumber(entry.moms),
    momsAccount: entry.momsAccount ? asNumber(entry.momsAccount) : null,
    amount: asNumber(entry.amount),
    type: entry.type || null,
    source: entry.source || null,
    notes: entry.notes || null,
    receiptRequired: entry.receiptRequired,
    version: entry.version,
  };
}

export function AccountingApp({ accessKey }: { accessKey: string }) {
  const api = useMemo(() => new AccountingApi(accessKey), [accessKey]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");
  const [sessionError, setSessionError] = useState("");
  const [online, setOnline] = useState(true);
  const [tab, setTab] = useState<AppTab>("home");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState("");
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const [draft, setDraft] = useState<AccountingDraft | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState<AccountingUploadProgress | null>(null);
  const [aiError, setAiError] = useState("");
  const [agentMessages, setAgentMessages] = useState<AccountingAgentMessage[]>([]);
  const [agentResult, setAgentResult] = useState<AccountingAgentResult | null>(null);
  const [agentProposal, setAgentProposal] = useState<AccountingAgentProposal | null>(null);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [agentLiveText, setAgentLiveText] = useState("");
  const [agentStatus, setAgentStatus] = useState("");
  const [ledgerDocFilter, setLedgerDocFilter] = useState<"all" | "missing">("all");
  const [toast, setToast] = useState("");
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (isValidAiSettings(parsed)) setAiSettings(parsed);
    } catch {
      // Ignore unreadable stored settings and keep the defaults.
    }
  }, []);

  const updateAiSettings = useCallback((next: AiSettings) => {
    setAiSettings(next);
    try {
      window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Persisting is best-effort; the in-memory choice still applies.
    }
  }, []);

  const expireSession = useCallback(() => {
    setSessionStatus("unauthenticated");
    setDashboard(null);
    setEntries([]);
    setEntriesLoaded(false);
    setAccounts([]);
    setEditingEntry(null);
    setDraft(null);
    setAgentMessages([]);
    setAgentResult(null);
    setAgentProposal(null);
  }, []);

  const handleUnauthorized = useCallback((error: unknown) => {
    if (!isUnauthorized(error)) return false;
    expireSession();
    return true;
  }, [expireSession]);

  const checkSession = useCallback(async () => {
    setSessionStatus("checking");
    setSessionError("");
    try {
      const authenticated = await api.session();
      setSessionStatus(authenticated ? "authenticated" : "unauthenticated");
    } catch (error) {
      if (isUnauthorized(error)) {
        setSessionStatus("unauthenticated");
        return;
      }
      const code = error instanceof AccountingApiError && error.code ? ` (${error.code})` : "";
      setSessionError(`${displayError(error, "Kunde inte kontrollera inloggningen.")}${code}`);
      setSessionStatus("error");
    }
  }, [api]);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError("");
    try {
      setDashboard(await api.dashboard());
    } catch (error) {
      if (!handleUnauthorized(error)) {
        setDashboardError(displayError(error, "Kunde inte hämta översikten."));
      }
    } finally {
      setDashboardLoading(false);
    }
  }, [api, handleUnauthorized]);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    setEntriesError("");
    try {
      const result = await api.entries("limit=500&sort=date&order=desc");
      setEntries(result.entries);
      setEntriesLoaded(true);
    } catch (error) {
      if (!handleUnauthorized(error)) {
        setEntriesError(displayError(error, "Kunde inte hämta verifikationerna."));
      }
    } finally {
      setEntriesLoading(false);
    }
  }, [api, handleUnauthorized]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      setAccounts(await api.accounts());
    } catch (error) {
      if (!handleUnauthorized(error)) {
        console.error("Kunde inte hämta kontoplanen", error);
      }
    } finally {
      setAccountsLoading(false);
    }
  }, [api, handleUnauthorized]);

  // A single place to call whenever anything anywhere may have changed the ledger,
  // the kontoplan, or an entry's documents — so no view is left showing stale data.
  const refreshAll = useCallback(() => {
    setEntriesLoaded(false);
    void loadDashboard();
    void loadAccounts();
  }, [loadAccounts, loadDashboard]);

  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = "sv";
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void checkSession();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.documentElement.lang = previousLanguage;
    };
  }, [checkSession]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && !dashboard) void loadDashboard();
  }, [dashboard, loadDashboard, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && tab === "ledger" && !entriesLoaded && !entriesLoading) {
      void loadEntries();
    }
  }, [entriesLoaded, entriesLoading, loadEntries, sessionStatus, tab]);

  useEffect(() => {
    if (sessionStatus === "authenticated") void loadAccounts();
  }, [loadAccounts, sessionStatus, tab]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function login(password: string) {
    const authenticated = await api.login(password);
    if (!authenticated) throw new Error("Inloggningen kunde inte bekräftas.");
    setSessionStatus("authenticated");
    setDashboard(null);
    setTab("home");
  }

  async function logout(allDevices = false) {
    try {
      await api.logout(allDevices);
    } finally {
      expireSession();
    }
  }

  function changeTab(next: AppTab) {
    setEditingEntry(null);
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refreshCurrent() {
    if (!online) {
      setToast("Du är offline. Anslut till internet och försök igen.");
      return;
    }
    if (tab === "ledger") await loadEntries();
    else await loadDashboard();
    await loadAccounts();
  }

  async function analyzeDraft() {
    if (!aiText.trim() && aiFiles.length === 0) {
      setAiError("Skriv vad posten gäller eller lägg till ett underlag.");
      return;
    }
    setAiLoading(true);
    setAiProgress(null);
    setAiError("");
    try {
      const nextDraft = await api.createDraft(aiText, aiFiles, setAiProgress);
      if (nextDraft.entries.length === 0) throw new Error("AI kunde inte hitta någon bokföringspost i underlaget.");
      setDraft(nextDraft);
      setTab("add");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      if (!handleUnauthorized(error)) setAiError(displayError(error, "AI-analysen misslyckades. Inget har sparats."));
    } finally {
      setAiLoading(false);
      setAiProgress(null);
    }
  }

  async function runAgent() {
    if (!aiText.trim() && aiFiles.length === 0) {
      setAiError("Skriv vad du vill att AI-agenten ska göra eller lägg till ett underlag.");
      return;
    }
    const requestText = aiText;
    const requestFiles = [...aiFiles];
    const attachmentSummary = requestFiles.length > 0
      ? `Bifogat: ${requestFiles.map((file) => file.name).join(", ")}`
      : "";
    const userMessage = [
      requestText.trim() || `Granska ${requestFiles.length} ${requestFiles.length === 1 ? "bifogat underlag" : "bifogade underlag"}.`,
      attachmentSummary,
    ].filter(Boolean).join("\n\n");
    const previousMessages = agentMessages;
    setAiLoading(true);
    setAiProgress(null);
    setAiError("");
    setAgentMessages((current) => [
      ...current,
      { role: "user", content: userMessage } as AccountingAgentMessage,
    ].slice(-12));
    setAiText("");
    setAiFiles([]);
    const liveSteps: AgentStep[] = [];
    setAgentSteps([]);
    setAgentLiveText("");
    setAgentStatus("Startar AI-agenten…");
    try {
      const result = await api.askAgentStream(
        requestText,
        requestFiles,
        previousMessages,
        {
          onProgress: setAiProgress,
          onEvent: (event) => {
            if (event.type === "status") {
              setAgentStatus(event.message);
            } else if (event.type === "tool-start") {
              liveSteps.push({
                id: event.callId || `step-${liveSteps.length}`,
                label: event.label,
                detail: event.detail,
                status: "running",
              });
              setAgentStatus("");
              setAgentSteps([...liveSteps]);
            } else if (event.type === "tool-end") {
              const step = liveSteps.find((item) => item.id === event.callId && item.status === "running");
              if (step) {
                step.status = event.ok ? "done" : "error";
                step.summary = event.summary;
              }
              setAgentSteps([...liveSteps]);
            } else if (event.type === "text-delta") {
              setAgentStatus("");
              setAgentLiveText((current) => current + event.text);
            }
          },
        },
        aiSettings,
      );
      setAgentMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: result.message,
          steps: liveSteps.length ? [...liveSteps] : undefined,
        } as AccountingAgentMessage,
      ].slice(-12));
      setAgentResult(result);
      // Some tools (attach_email_receipt, create_account) write immediately without a
      // review step, so refresh the ledger/kontoplan/dashboard even without a draft or proposal.
      refreshAll();
    } catch (error) {
      if (!handleUnauthorized(error)) {
        setAgentMessages(previousMessages);
        setAiText(requestText);
        setAiFiles(requestFiles);
        setAiError(displayError(error, "AI-agenten kunde inte slutföra uppdraget. Ingenting ändrades."));
      }
    } finally {
      setAiLoading(false);
      setAiProgress(null);
      setAgentSteps([]);
      setAgentLiveText("");
      setAgentStatus("");
    }
  }

  function startManualDraft() {
    setAiError("");
    setDraft(createManualDraft());
    setTab("add");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openEntry(entry: AccountingEntry) {
    setTab("ledger");
    setEditingEntry(entry);
    setEntryLoading(true);
    setEntriesError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      setEditingEntry(await api.entry(entry.id));
    } catch (error) {
      if (!handleUnauthorized(error)) setEntriesError(displayError(error, "Kunde inte läsa hela posten."));
    } finally {
      setEntryLoading(false);
    }
  }

  function completeSave(message: string) {
    setDraft(null);
    setAiText("");
    setAiFiles([]);
    setEditingEntry(null);
    setTab("home");
    setToast(message);
    refreshAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function completeAgentChanges(message: string) {
    setAgentProposal(null);
    setAgentResult((current) => current ? { ...current, proposal: null } : current);
    setAgentMessages((current) => [
      ...current,
      { role: "assistant", content: message } as AccountingAgentMessage,
    ].slice(-12));
    setEditingEntry(null);
    setTab("chat");
    setToast(message);
    refreshAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (sessionStatus === "checking") {
    return <LoadingGate />;
  }

  if (sessionStatus === "error") {
    return <ConnectionGate message={sessionError} online={online} onRetry={() => void checkSession()} />;
  }

  if (sessionStatus === "unauthenticated") {
    return <LoginGate online={online} onLogin={login} />;
  }

  const refreshing = dashboardLoading || entriesLoading || entryLoading || accountsLoading;

  return (
    <main className="accounting-app ac-shell">
      <header className="ac-topbar">
        <div className="ac-topbar-inner">
          <div className="ac-brand-lockup">
            <span className="ac-logo" aria-hidden="true">
              <Image alt="" height={42} priority src="/accounting-logo.png" width={42} />
            </span>
            <div>
              <span className="ac-brand-name">Wallerstedt</span>
              <span className="ac-brand-subtitle">Bokföring</span>
            </div>
          </div>
          <div className="ac-topbar-actions">
            <span className={`ac-online-pill ${online ? "is-online" : "is-offline"}`} role="status">
              {online ? <Icon.Cloud size={16} /> : <Icon.WifiOff size={16} />}
              <span>{online ? "Online" : "Offline"}</span>
            </span>
            <button
              aria-label="Uppdatera data"
              className="ac-icon-button"
              disabled={refreshing}
              onClick={() => void refreshCurrent()}
              type="button"
            >
              <Icon.Refresh className={refreshing ? "is-spinning" : ""} />
            </button>
          </div>
        </div>
      </header>

      {!online && (
        <div className="ac-offline-banner" role="status">
          <Icon.WifiOff size={18} /> Du är offline. Redigering och AI kräver internet.
        </div>
      )}

      <div className="ac-page-wrap">
        {agentProposal ? (
          <AgentProposalReview
            api={api}
            onCancel={() => setAgentProposal(null)}
            onExpired={expireSession}
            onSaved={completeAgentChanges}
            proposal={agentProposal}
          />
        ) : draft ? (
          <DraftReview
            accounts={accounts}
            api={api}
            draft={draft}
            onCancel={() => setDraft(null)}
            onChange={setDraft}
            onExpired={expireSession}
            onSaved={completeSave}
          />
        ) : editingEntry ? (
          <EntryEditor
            accessKey={accessKey}
            accounts={accounts}
            api={api}
            entry={editingEntry}
            loading={entryLoading}
            onBack={() => setEditingEntry(null)}
            onChange={setEditingEntry}
            onDeleted={() => completeSave("Posten har tagits bort.")}
            onExpired={expireSession}
            onSaved={(entry) => {
              setEditingEntry(entry);
              setEntries((current) => current.map((item) => item.id === entry.id ? entry : item));
              setToast("Ändringarna är sparade.");
              refreshAll();
            }}
          />
        ) : tab === "home" ? (
          <HomeView
            dashboard={dashboard}
            error={dashboardError}
            loading={dashboardLoading}
            onAddNew={() => changeTab("add")}
            onOpenChat={() => changeTab("chat")}
            onOpenEntry={(entry) => void openEntry(entry)}
            onOpenLedger={() => {
              setLedgerDocFilter("all");
              changeTab("ledger");
            }}
            onRetry={() => void loadDashboard()}
            onShowMissing={() => {
              setLedgerDocFilter("missing");
              changeTab("ledger");
            }}
          />
        ) : tab === "chat" ? (
          <ChatView
            aiError={aiError}
            files={aiFiles}
            liveStatus={agentStatus}
            liveSteps={agentSteps}
            liveText={agentLiveText}
            loading={aiLoading}
            messages={agentMessages}
            onAnalyze={() => void runAgent()}
            onClear={() => {
              setAgentMessages([]);
              setAgentResult(null);
            }}
            onFiles={setAiFiles}
            onManual={startManualDraft}
            onOpenDraft={(nextDraft) => {
              setDraft(nextDraft);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onOpenEntry={(entry) => void openEntry(entry)}
            onReviewProposal={setAgentProposal}
            onSettings={updateAiSettings}
            onText={setAiText}
            progress={aiProgress}
            result={agentResult}
            settings={aiSettings}
            text={aiText}
          />
        ) : tab === "add" ? (
          <AddView
            aiError={aiError}
            files={aiFiles}
            loading={aiLoading}
            onAnalyze={() => void analyzeDraft()}
            onFiles={setAiFiles}
            onManual={startManualDraft}
            onText={setAiText}
            text={aiText}
            progress={aiProgress}
          />
        ) : tab === "ledger" ? (
          <LedgerView
            docFilter={ledgerDocFilter}
            entries={entries}
            error={entriesError}
            loading={entriesLoading}
            onDocFilter={setLedgerDocFilter}
            onOpenEntry={(entry) => void openEntry(entry)}
            onRetry={() => void loadEntries()}
          />
        ) : (
          <SettingsView
            api={api}
            dashboard={dashboard}
            onBackupComplete={loadDashboard}
            onExpired={expireSession}
            onLogout={() => void logout()}
            onLogoutAll={() => void logout(true)}
          />
        )}
      </div>

      <BottomNav active={tab} onChange={changeTab} />

      {toast && (
        <div className="ac-toast" role="status">
          <span><Icon.Check size={18} /></span>{toast}
        </div>
      )}
    </main>
  );
}

function LoadingGate() {
  return (
    <main className="accounting-app ac-gate ac-loading-gate" aria-busy="true">
      <span className="ac-gate-logo" aria-hidden="true">
        <Image alt="" height={56} priority src="/accounting-logo.png" width={56} />
      </span>
      <div className="ac-loader" aria-hidden="true" />
      <p>Öppnar din bokföring…</p>
    </main>
  );
}

function ConnectionGate({ message, online, onRetry }: { message: string; online: boolean; onRetry: () => void }) {
  return (
    <main className="accounting-app ac-gate">
      <section className="ac-login-card ac-connection-card">
        <span className="ac-gate-logo ac-gate-logo--warning">{online ? <Icon.Cloud /> : <Icon.WifiOff />}</span>
        <p className="ac-eyebrow">Anslutningsproblem</p>
        <h1>Bokföringen kunde inte öppnas</h1>
        <p>{message}</p>
        <button className="ac-button ac-button--primary ac-button--full" type="button" onClick={onRetry}>
          <Icon.Refresh /> Försök igen
        </button>
        <p className="ac-help-text">Inga uppgifter har ändrats eller försvunnit.</p>
      </section>
    </main>
  );
}

function LoginGate({ online, onLogin }: { online: boolean; onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError("Skriv ditt lösenord.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onLogin(password);
    } catch (loginError) {
      setError(displayError(loginError, "Inloggningen misslyckades."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="accounting-app ac-gate ac-login-gate">
      <div className="ac-login-aura" aria-hidden="true" />
      <section className="ac-login-card">
        <div className="ac-login-heading">
          <span className="ac-gate-logo" aria-hidden="true">
            <Image alt="" height={54} priority src="/accounting-logo.png" width={54} />
          </span>
          <div>
            <p className="ac-eyebrow">Wallerstedt Productions AB</p>
            <h1>Din bokföring</h1>
          </div>
        </div>
        <p className="ac-login-intro">Privat åtkomst till verifikationer, underlag, AI-hjälp och säkerhetskopior.</p>
        <div className={`ac-login-status ${online ? "is-online" : "is-offline"}`}>
          {online ? <Icon.Shield size={18} /> : <Icon.WifiOff size={18} />}
          {online ? "Säker anslutning" : "Ingen internetanslutning"}
        </div>
        <form className="ac-login-form" onSubmit={submit}>
          <label className="ac-field">
            <span>Lösenord</span>
            <span className="ac-password-field">
              <input
                autoComplete="current-password"
                autoFocus
                disabled={submitting || !online}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Ditt privata lösenord"
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? <Icon.EyeOff /> : <Icon.Eye />}
              </button>
            </span>
          </label>
          {error && <p className="ac-form-error" role="alert"><Icon.Alert size={18} /> {error}</p>}
          <button className="ac-button ac-button--primary ac-button--full" disabled={submitting || !online} type="submit">
            {submitting ? <><span className="ac-button-spinner" /> Loggar in…</> : <><Icon.Shield /> Öppna bokföringen</>}
          </button>
        </form>
        <p className="ac-login-footnote"><Icon.Info size={17} /> Den privata länken räcker inte ensam – ditt lösenord krävs också.</p>
      </section>
    </main>
  );
}

function BottomNav({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  const items: Array<{ id: AppTab; label: string; icon: typeof Icon.Home }> = [
    { id: "home", label: "Hem", icon: Icon.Home },
    { id: "ledger", label: "Poster", icon: Icon.Receipt },
    { id: "add", label: "Ny", icon: Icon.Plus },
    { id: "chat", label: "AI", icon: Icon.Spark },
    { id: "settings", label: "Mer", icon: Icon.Settings },
  ];
  return (
    <nav className="ac-bottom-nav" aria-label="Bokföring">
      <div className="ac-bottom-nav-inner">
        {items.map((item) => {
          const ItemIcon = item.icon;
          const isAdd = item.id === "add";
          return (
            <button
              aria-current={active === item.id ? "page" : undefined}
              className={`${active === item.id ? "is-active" : ""} ${isAdd ? "is-add" : ""}`}
              key={item.id}
              onClick={() => onChange(item.id)}
              type="button"
            >
              <span className="ac-nav-icon"><ItemIcon size={isAdd ? 26 : 22} /></span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="ac-page-heading">
      <p className="ac-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}

type ComposerProps = {
  agentMode?: boolean;
  aiError: string;
  compact?: boolean;
  files: File[];
  loading: boolean;
  onAnalyze: () => void;
  onFiles: (files: File[]) => void;
  onManual: () => void;
  onText: (text: string) => void;
  progress: AccountingUploadProgress | null;
  text: string;
};

function homeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "God natt";
  if (hour < 10) return "God morgon";
  if (hour < 18) return "Hej";
  return "God kväll";
}

function HomeView({
  dashboard,
  error,
  loading,
  onAddNew,
  onOpenChat,
  onOpenEntry,
  onOpenLedger,
  onRetry,
  onShowMissing,
}: {
  dashboard: DashboardData | null;
  error: string;
  loading: boolean;
  onAddNew: () => void;
  onOpenChat: () => void;
  onOpenEntry: (entry: AccountingEntry) => void;
  onOpenLedger: () => void;
  onRetry: () => void;
  onShowMissing: () => void;
}) {
  const summary = dashboard?.summary ?? null;
  const resultPositive = (summary?.result ?? 0) >= 0;

  return (
    <div className="ac-view ac-home-view">
      <header className="ac-home-greeting">
        <p className="ac-eyebrow">Wallerstedt Productions AB</p>
        <h1>{homeGreeting()} Calle</h1>
      </header>

      {loading && !dashboard ? (
        <>
          <div className="ac-hero-card ac-skeleton-card" aria-hidden="true" />
          <div className="ac-stat-grid" aria-label="Laddar nyckeltal">
            <div className="ac-stat-card ac-skeleton-card" />
            <div className="ac-stat-card ac-skeleton-card" />
            <div className="ac-stat-card ac-skeleton-card" />
            <div className="ac-stat-card ac-skeleton-card" />
          </div>
        </>
      ) : error && !dashboard ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : summary ? (
        <>
          <section className="ac-hero-card" aria-labelledby="hero-balance-heading">
            <div className="ac-hero-main">
              <span id="hero-balance-heading">Företagskonto</span>
              <strong>{formatCurrency(summary.companyAccountBalance)}</strong>
              <small>
                Konto 1930
                {summary.accountBalancesAsOf ? ` · t.o.m. ${formatDate(summary.accountBalancesAsOf)}` : ""}
              </small>
            </div>
            <div className="ac-hero-row">
              <div>
                <span>KF Avanza</span>
                <strong>{formatCurrency(summary.capitalInsuranceBalance)}</strong>
                <small>Konto 1385</small>
              </div>
              <div>
                <span>Skuld</span>
                <strong>{formatCurrency(summary.debt)}</strong>
                <small>Bokförda skulder</small>
              </div>
            </div>
          </section>

          {summary.missingReceiptCount > 0 && (
            <button className="ac-missing-banner" onClick={onShowMissing} type="button">
              <span className="ac-missing-banner-icon"><Icon.Alert size={19} /></span>
              <span className="ac-missing-banner-copy">
                <strong>{summary.missingReceiptCount} {summary.missingReceiptCount === 1 ? "post saknar underlag" : "poster saknar underlag"}</strong>
                <small>Tryck för att se och komplettera med kvitton</small>
              </span>
              <Icon.Chevron size={19} />
            </button>
          )}

          <section className="ac-quick-actions" aria-label="Genvägar">
            <button className="ac-quick-action ac-quick-action--chat" onClick={onOpenChat} type="button">
              <span className="ac-quick-action-icon"><Icon.Spark size={22} /></span>
              <span className="ac-quick-action-copy">
                <strong>Fråga Bokförings-AI</strong>
                <small>Bokför kvitton, sök och rätta poster</small>
              </span>
              <Icon.Chevron size={19} />
            </button>
            <button className="ac-quick-action" onClick={onAddNew} type="button">
              <span className="ac-quick-action-icon"><Icon.Plus size={22} /></span>
              <span className="ac-quick-action-copy">
                <strong>Ny post</strong>
                <small>Foto, fil eller manuellt</small>
              </span>
              <Icon.Chevron size={19} />
            </button>
          </section>

          <section className="ac-section-block" aria-labelledby="stats-heading">
            <div className="ac-section-heading-row">
              <h2 id="stats-heading">Året i siffror</h2>
            </div>
            <div className="ac-stat-grid">
              <article className={`ac-stat-card ac-stat-card--wide ${resultPositive ? "is-positive" : "is-negative"}`}>
                <span>Resultat</span>
                <strong>{formatCurrency(summary.result)}</strong>
                <small>{resultPositive ? "Intäkter minus kostnader" : "Kostnaderna överstiger intäkterna"}</small>
              </article>
              <article className="ac-stat-card">
                <span>Intäkter</span>
                <strong className="ac-text-positive">{formatCurrency(summary.income)}</strong>
              </article>
              <article className="ac-stat-card">
                <span>Kostnader</span>
                <strong className="ac-text-negative">{formatCurrency(summary.expenses)}</strong>
              </article>
              <article className="ac-stat-card">
                <span>Moms</span>
                <strong>{formatCurrency(summary.vat)}</strong>
              </article>
              <article className="ac-stat-card">
                <span>Underlag</span>
                <strong>{numberFormatter.format(summary.receiptCount)}</strong>
              </article>
            </div>
          </section>
        </>
      ) : null}

      <section className="ac-section-block" aria-labelledby="recent-heading">
        <div className="ac-section-heading-row">
          <h2 id="recent-heading">Senaste poster</h2>
          {dashboard && (
            <button className="ac-see-all" onClick={onOpenLedger} type="button">
              Visa alla {dashboard.summary.entryCount} <Icon.Chevron size={16} />
            </button>
          )}
        </div>
        {loading && !dashboard ? (
          <EntryListSkeleton count={3} />
        ) : error && !dashboard ? null : dashboard?.recentEntries.length ? (
          <div className="ac-entry-list">
            {dashboard.recentEntries.slice(0, 6).map((entry) => (
              <EntryRow entry={entry} key={entry.id} onClick={() => onOpenEntry(entry)} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Icon.Receipt />}
            title="Inga poster ännu"
            description="Din första sparade post kommer att visas här. Börja med AI-fliken."
          />
        )}
      </section>

      {dashboard?.backup && (
        <div className="ac-backup-mini">
          <span className={`ac-backup-dot ${dashboard.backup.status === "error" ? "is-error" : ""}`} />
          <div>
            <strong>{dashboard.backup.status === "error" ? "Kontrollera backup" : "Senaste backup"}</strong>
            <span>{formatDateTime(dashboard.backup.lastAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

type AgentChatProps = {
  aiError: string;
  files: File[];
  liveStatus: string;
  liveSteps: AgentStep[];
  liveText: string;
  loading: boolean;
  messages: AccountingAgentMessage[];
  onAnalyze: () => void;
  onClear: () => void;
  onFiles: (files: File[]) => void;
  onManual: () => void;
  onOpenDraft: (draft: AccountingDraft) => void;
  onOpenEntry: (entry: AccountingEntry) => void;
  onReviewProposal: (proposal: AccountingAgentProposal) => void;
  onSettings: (settings: AiSettings) => void;
  onText: (text: string) => void;
  progress: AccountingUploadProgress | null;
  result: AccountingAgentResult | null;
  settings: AiSettings;
  text: string;
};

function ChatView(props: AgentChatProps) {
  return (
    <div className="ac-view ac-chat-view">
      <AgentChat {...props} />
    </div>
  );
}

function AgentChat({
  aiError,
  files,
  liveStatus,
  liveSteps,
  liveText,
  loading,
  messages,
  onAnalyze,
  onClear,
  onFiles,
  onManual,
  onOpenDraft,
  onOpenEntry,
  onReviewProposal,
  onSettings,
  onText,
  progress,
  result,
  settings,
  text,
}: AgentChatProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const modelMenuRef = useRef<HTMLDetailsElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteError, setPasteError] = useState("");

  useEffect(() => {
    if (messages.length === 0 && !loading && !result) return;
    chatEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [liveStatus, liveSteps, liveText, loading, messages, result]);

  function appendFiles(nextFiles: File[]) {
    const merged = [...files];
    nextFiles.filter((file) => file.size > 0).forEach((file) => {
      if (!merged.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified)) {
        merged.push(file);
      }
    });
    onFiles(merged.slice(0, 8));
  }

  function picked(event: ChangeEvent<HTMLInputElement>) {
    appendFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
    if (menuRef.current) menuRef.current.open = false;
    textareaRef.current?.focus();
  }

  async function pasteFromClipboard() {
    if (menuRef.current) menuRef.current.open = false;
    setPasteError("");
    try {
      appendFiles(await readClipboardFiles());
      textareaRef.current?.focus();
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : "Kunde inte läsa urklippet.");
    }
  }

  function pasted(event: ClipboardEvent<HTMLTextAreaElement>) {
    const directFiles = Array.from(event.clipboardData.files);
    const itemFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const pastedFiles = directFiles.length > 0 ? directFiles : itemFiles;
    if (pastedFiles.length === 0) return;
    event.preventDefault();
    appendFiles(pastedFiles);
  }

  function dropped(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    appendFiles(Array.from(event.dataTransfer.files));
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!loading && (text.trim() || files.length > 0)) onAnalyze();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  function resizeTextarea(element: HTMLTextAreaElement) {
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 144)}px`;
  }

  const hasConversation = messages.length > 0 || result;
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <section
      className={`ac-agent-chat ${dragging ? "is-dragging" : ""}`}
      aria-labelledby="accounting-chat-heading"
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={dropped}
    >
      <header className="ac-agent-chat-header">
        <div className="ac-agent-chat-identity">
          <span><Icon.Spark size={19} /></span>
          <div>
            <h2 id="accounting-chat-heading">Bokförings-AI</h2>
            <small>Kan läsa bokföringen, söka i Gmail och förbereda ändringar</small>
          </div>
        </div>
        <div className="ac-agent-header-actions">
          <details className="ac-agent-model-picker" ref={modelMenuRef}>
            <summary aria-label="Välj AI-modell och tankekraft">
              {AI_MODEL_OPTIONS.find((option) => option.id === settings.model)?.short}
              <i aria-hidden="true">·</i>
              {AI_EFFORT_OPTIONS.find((option) => option.id === settings.reasoningEffort)?.label}
            </summary>
            <div className="ac-agent-model-menu">
              <p>Modell</p>
              {AI_MODEL_OPTIONS.map((option) => (
                <button
                  className={settings.model === option.id ? "is-active" : ""}
                  disabled={loading}
                  key={option.id}
                  onClick={() => onSettings({
                    model: option.id,
                    reasoningEffort:
                      settings.reasoningEffort === "max" && option.id !== "gpt-5.6-sol"
                        ? "xhigh"
                        : settings.reasoningEffort,
                  })}
                  type="button"
                >
                  <span><strong>{option.label}</strong><small>{option.hint}</small></span>
                  {settings.model === option.id && <Icon.Check size={16} />}
                </button>
              ))}
              <p>Tankekraft</p>
              {AI_EFFORT_OPTIONS.map((option) => {
                const solOnly = option.id === "max" && settings.model !== "gpt-5.6-sol";
                return (
                  <button
                    className={settings.reasoningEffort === option.id ? "is-active" : ""}
                    disabled={loading || solOnly}
                    key={option.id}
                    onClick={() => {
                      onSettings({ ...settings, reasoningEffort: option.id as AiReasoningEffort });
                      if (modelMenuRef.current) modelMenuRef.current.open = false;
                    }}
                    type="button"
                  >
                    <span><strong>{option.label}</strong><small>{option.hint}</small></span>
                    {settings.reasoningEffort === option.id && <Icon.Check size={16} />}
                  </button>
                );
              })}
            </div>
          </details>
          {hasConversation && (
            <button className="ac-agent-new-chat" disabled={loading} onClick={onClear} type="button">
              Nytt samtal
            </button>
          )}
        </div>
      </header>

      <div className={`ac-agent-chat-thread ${hasConversation ? "has-conversation" : "is-empty"}`} aria-live="polite">
        {!hasConversation && (
          <div className="ac-agent-chat-welcome">
            <span><Icon.Spark size={24} /></span>
            <h3>Vad vill du göra?</h3>
            <p>Fråga om bokföringen, skapa poster eller lägg till kvitton och filer.</p>
            <div className="ac-agent-suggestions" aria-label="Förslag">
              {["Hitta saknade kvitton i min Gmail", "Visa vad jag behöver bokföra", "Kontrollera senaste posterna", "Hjälp mig bokföra ett kvitto"].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    onText(suggestion);
                    window.setTimeout(() => textareaRef.current?.focus(), 0);
                  }}
                  type="button"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.slice(-12).map((message, index) => (
          <div className={`ac-agent-chat-message is-${message.role}`} key={`${message.role}-${index}-${message.content.slice(0, 20)}`}>
            {message.role === "assistant" && <span className="ac-agent-chat-avatar"><Icon.Spark size={15} /></span>}
            <div className="ac-agent-chat-bubble">
              {message.steps && message.steps.length > 0 && (
                <details className="ac-agent-steps-recap">
                  <summary>
                    <Icon.Check size={14} /> {message.steps.length} {message.steps.length === 1 ? "steg utfört" : "steg utförda"}
                  </summary>
                  <AgentStepList steps={message.steps} />
                </details>
              )}
              <AgentMessageContent content={message.content} />
            </div>
          </div>
        ))}

        {loading && (
          <div className="ac-agent-chat-message is-assistant is-loading" role="status">
            <span className="ac-agent-chat-avatar"><Icon.Spark size={15} /></span>
            <div className="ac-agent-chat-bubble ac-agent-live-bubble">
              {liveSteps.length > 0 && <AgentStepList steps={liveSteps} live />}
              {liveText ? (
                <AgentMessageContent content={liveText} />
              ) : (
                <>
                  <span className="ac-agent-thinking"><i /><i /><i /></span>
                  <small>
                    {progress?.phase === "uploading"
                      ? "Laddar upp underlag…"
                      : liveStatus || (liveSteps.some((step) => step.status === "running")
                        ? "Väntar på verktyget…"
                        : "Funderar på nästa steg…")}
                  </small>
                </>
              )}
            </div>
          </div>
        )}

        {result && (
          <AgentResultPanel
            onOpenDraft={onOpenDraft}
            onOpenEntry={onOpenEntry}
            onReviewProposal={onReviewProposal}
            result={result}
          />
        )}
        <div ref={chatEndRef} />
      </div>

      <form className="ac-agent-chat-composer" onSubmit={submit}>
        <input accept="image/*" capture="environment" className="ac-visually-hidden" onChange={picked} ref={cameraRef} type="file" />
        <input accept="image/jpeg,image/png,.pdf,.txt,.csv" className="ac-visually-hidden" multiple onChange={picked} ref={filesRef} type="file" />

        {files.length > 0 && (
          <div className="ac-agent-chat-files">
            <div className="ac-agent-chat-file-summary">
              <span>{files.length} {files.length === 1 ? "bilaga" : "bilagor"}</span>
              <small>{totalSize < 1_000_000 ? `${Math.max(1, Math.round(totalSize / 1000))} kB` : `${(totalSize / 1_000_000).toFixed(1).replace(".", ",")} MB`}</small>
            </div>
            <div className="ac-agent-chat-file-list">
              {files.map((file, index) => (
                <div className="ac-agent-chat-file" key={`${file.name}-${file.size}-${file.lastModified}`}>
                  <span><Icon.File size={16} /></span>
                  <strong>{file.name}</strong>
                  <button aria-label={`Ta bort ${file.name}`} onClick={() => onFiles(files.filter((_, fileIndex) => fileIndex !== index))} type="button"><Icon.Close size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {aiError && <p className="ac-form-error" role="alert"><Icon.Alert size={18} /> {aiError}</p>}
        {pasteError && <p className="ac-form-error" role="alert"><Icon.Alert size={18} /> {pasteError}</p>}

        <div className="ac-agent-chat-input-row">
          <details className="ac-agent-attach" ref={menuRef}>
            <summary aria-label="Lägg till bilaga"><Icon.Plus size={21} /></summary>
            <div className="ac-agent-attach-menu">
              <button disabled={loading} onClick={() => cameraRef.current?.click()} type="button"><Icon.Camera size={19} /><span><strong>Ta foto</strong><small>Använd kameran</small></span></button>
              <button disabled={loading} onClick={() => filesRef.current?.click()} type="button"><Icon.Upload size={19} /><span><strong>Välj filer</strong><small>Bild, PDF, text eller CSV</small></span></button>
              <button disabled={loading} onClick={() => void pasteFromClipboard()} type="button"><Icon.Clipboard size={19} /><span><strong>Klistra in</strong><small>Bild eller fil från urklipp</small></span></button>
              <button disabled={loading} onClick={() => { if (menuRef.current) menuRef.current.open = false; onManual(); }} type="button"><Icon.Edit size={19} /><span><strong>Manuell post</strong><small>Fyll i själv</small></span></button>
            </div>
          </details>
          <textarea
            aria-label="Meddelande till Bokförings-AI"
            disabled={loading}
            onChange={(event) => {
              onText(event.target.value);
              resizeTextarea(event.target);
            }}
            onKeyDown={handleKeyDown}
            onPaste={pasted}
            placeholder="Skriv till Bokförings-AI…"
            ref={textareaRef}
            rows={1}
            value={text}
          />
          <button
            aria-label="Skicka meddelande"
            className="ac-agent-chat-send"
            disabled={loading || (!text.trim() && files.length === 0)}
            type="submit"
          >
            {loading ? <span className="ac-button-spinner" /> : <Icon.Chevron size={21} />}
          </button>
        </div>
        <p className="ac-agent-chat-hint">Enter skickar · Shift + Enter gör ny rad · klistra in bilder direkt</p>
        <p className="ac-agent-chat-safety"><Icon.Shield size={14} /> Ändringar kräver alltid ditt godkännande</p>
      </form>

      {dragging && (
        <div className="ac-agent-drop-overlay" aria-hidden="true">
          <Icon.Upload size={28} />
          <strong>Släpp filer här</strong>
          <small>Upp till 8 underlag per meddelande</small>
        </div>
      )}
    </section>
  );
}

function AgentStepList({ steps, live = false }: { steps: AgentStep[]; live?: boolean }) {
  return (
    <ol className={`ac-agent-activity ${live ? "is-live" : ""}`} aria-label="AI-agentens steg">
      {steps.map((step) => (
        <li className={`ac-agent-step is-${step.status}`} key={step.id}>
          <span className="ac-agent-step-icon" aria-hidden="true">
            {step.status === "running" ? (
              <span className="ac-step-spinner" />
            ) : step.status === "error" ? (
              <Icon.Alert size={13} />
            ) : (
              <Icon.Check size={13} />
            )}
          </span>
          <span className="ac-agent-step-text">
            <strong>{step.label}</strong>
            {step.detail && <em>{step.detail}</em>}
            {step.summary && <small>{step.summary}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function AgentInlineText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

function AgentMessageContent({ content }: { content: string }) {
  return (
    <div className="ac-agent-message-body">
      {content.split("\n").map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <span className="ac-agent-message-space" key={`space-${index}`} />;
        if (trimmed.startsWith("- ")) {
          return <p className="is-list-item" key={`${trimmed}-${index}`}><AgentInlineText text={trimmed.slice(2)} /></p>;
        }
        return <p key={`${trimmed}-${index}`}><AgentInlineText text={trimmed} /></p>;
      })}
    </div>
  );
}

function AgentResultPanel({
  onOpenDraft,
  onOpenEntry,
  onReviewProposal,
  result,
}: {
  onOpenDraft: (draft: AccountingDraft) => void;
  onOpenEntry: (entry: AccountingEntry) => void;
  onReviewProposal: (proposal: AccountingAgentProposal) => void;
  result: AccountingAgentResult;
}) {
  const proposalCount = (result.proposal?.edits.length ?? 0) + (result.proposal?.deletes.length ?? 0);
  return (
    <section className="ac-card ac-agent-result" aria-label="AI-agentens resultat">
      {result.tools.length > 0 && (
        <div className="ac-agent-tool-list" aria-label="Använda verktyg">
          {result.tools.map((tool) => <span key={tool.name}><Icon.Check size={14} /> {tool.label}</span>)}
        </div>
      )}

      {(result.draft || result.proposal) && (
        <div className="ac-agent-action-grid">
          {result.draft && (
            <button className="ac-agent-action-card" onClick={() => onOpenDraft(result.draft!)} type="button">
              <span><Icon.Plus size={20} /></span>
              <div>
                <strong>Granska {result.draft.entries.length} {result.draft.entries.length === 1 ? "nytt utkast" : "nya utkast"}</strong>
                <small>Inget är bokfört ännu</small>
              </div>
              <Icon.Chevron size={19} />
            </button>
          )}
          {result.proposal && (
            <button className="ac-agent-action-card" onClick={() => onReviewProposal(result.proposal!)} type="button">
              <span><Icon.Edit size={20} /></span>
              <div>
                <strong>Granska {proposalCount} {proposalCount === 1 ? "ändring" : "ändringar"}</strong>
                <small>{result.proposal.deletes.length > 0 ? `${result.proposal.deletes.length} borttagning väntar` : "Väntar på ditt godkännande"}</small>
              </div>
              <Icon.Chevron size={19} />
            </button>
          )}
        </div>
      )}

      {result.gmailAttachments.length > 0 && (
        <div className="ac-agent-gmail-attachments">
          <strong>Kvitton hämtade från Gmail</strong>
          {result.gmailAttachments.map((attachment, index) => {
            const entry = result.referencedEntries.find((item) => item.id === attachment.entryId);
            return (
              <button
                className="ac-agent-gmail-attachment"
                disabled={!entry}
                key={`${attachment.entryId}-${attachment.document.id ?? index}`}
                onClick={() => entry && onOpenEntry(entry)}
                type="button"
              >
                <span><Icon.Paperclip size={16} /></span>
                <span className="ac-agent-gmail-attachment-info">
                  <strong>{attachment.document.originalName ?? attachment.document.name ?? "Kvitto"}</strong>
                  <small>{attachment.account}{entry ? ` · ${entry.description}` : ""}</small>
                </span>
                {entry && <Icon.Chevron size={17} />}
              </button>
            );
          })}
        </div>
      )}

      {result.referencedEntries.length > 0 && (
        <div className="ac-agent-references">
          <strong>Poster AI tittade på</strong>
          <div className="ac-entry-list">
            {result.referencedEntries.slice(0, 5).map((entry) => (
              <EntryRow entry={entry} key={entry.id} onClick={() => onOpenEntry(entry)} />
            ))}
          </div>
          {result.referencedEntries.length > 5 && <small>+ {result.referencedEntries.length - 5} fler poster analyserades</small>}
        </div>
      )}

      <p className="ac-agent-result-safety"><Icon.Shield size={16} /> Läsverktyg och kvittohämtning från Gmail körs direkt. Bokföring, ändringar och borttagning kräver alltid din granskning.</p>
    </section>
  );
}

function agentFieldValue(entry: AccountingEntry, field: string) {
  switch (field) {
    case "date": return entry.date || "Saknas";
    case "description": return entry.description || "Saknas";
    case "debit": return `${entry.debitAccount || "–"}${entry.debitName ? ` · ${entry.debitName}` : ""}`;
    case "credit": return `${entry.creditAccount || "–"}${entry.creditName ? ` · ${entry.creditName}` : ""}`;
    case "amountExVat": return entry.beloppExMoms == null ? "Saknas" : formatCurrency(entry.beloppExMoms);
    case "vat": return `${entry.moms == null ? "Saknas" : formatCurrency(entry.moms)}${entry.momsAccount ? ` · konto ${entry.momsAccount}` : ""}`;
    case "amount": return formatCurrency(entry.amount);
    case "type": return entry.type || "Saknas";
    case "source": return entry.source || "Saknas";
    case "notes": return entry.notes || "Saknas";
    case "status": return entry.status || "Saknas";
    case "receiptRequired": return entry.receiptRequired ? "Ja" : "Nej";
    default: return "";
  }
}

function agentChangedFields(current: AccountingEntry, proposed: AccountingEntry) {
  const fields = [
    ["date", "Datum"],
    ["description", "Beskrivning"],
    ["debit", "Debet"],
    ["credit", "Kredit"],
    ["amountExVat", "Exkl. moms"],
    ["vat", "Moms"],
    ["amount", "Totalbelopp"],
    ["type", "Typ"],
    ["source", "Källa"],
    ["notes", "Anteckning"],
    ["status", "Status"],
    ["receiptRequired", "Bilaga behövs"],
  ] as const;
  return fields
    .map(([field, label]) => ({
      field,
      label,
      before: agentFieldValue(current, field),
      after: agentFieldValue(proposed, field),
    }))
    .filter((change) => change.before !== change.after);
}

function AgentProposalReview({
  api,
  onCancel,
  onExpired,
  onSaved,
  proposal,
}: {
  api: AccountingApi;
  onCancel: () => void;
  onExpired: () => void;
  onSaved: (message: string) => void;
  proposal: AccountingAgentProposal;
}) {
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const total = proposal.edits.length + proposal.deletes.length;
  const allReviewed = reviewed.size === total;

  function setChecked(key: string, checked: boolean) {
    setReviewed((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    setError("");
  }

  async function apply() {
    if (!allReviewed) {
      setError(`Kontrollera alla ändringar först. ${total - reviewed.size} återstår.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await api.applyAgentProposal(proposal.token);
      const count = result.updated.length + result.deleted.length;
      onSaved(`${count} ${count === 1 ? "AI-ändring har" : "AI-ändringar har"} godkänts och sparats.`);
    } catch (applyError) {
      if (isUnauthorized(applyError)) onExpired();
      else setError(displayError(applyError, "Ändringarna kunde inte sparas. Ingenting ändrades."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ac-view ac-agent-review-view">
      <button className="ac-back-button" disabled={saving} onClick={onCancel} type="button"><Icon.ArrowLeft /> Tillbaka utan att ändra</button>
      <div className="ac-review-heading">
        <div>
          <p className="ac-eyebrow">AI-agent · godkännande</p>
          <h1>Granska alla ändringar</h1>
          <p>AI har förberett detta men ännu inte ändrat huvudboken. Varje punkt måste kontrolleras.</p>
        </div>
        <span className="ac-review-badge"><Icon.Shield size={18} /> Ej sparat</span>
      </div>

      <div className="ac-draft-stack">
        {proposal.edits.map((edit, index) => {
          const key = `edit-${edit.id}`;
          const changes = agentChangedFields(edit.current, edit.proposed);
          return (
            <article className={`ac-card ac-agent-change-card ${reviewed.has(key) ? "is-reviewed" : ""}`} key={key}>
              <div className="ac-draft-card-heading">
                <div><span>{index + 1}</span><h2>{edit.current.description || "Bokföringspost"}</h2></div>
                <span className="ac-agent-change-kind"><Icon.Edit size={16} /> Ändra</span>
              </div>
              <p className="ac-agent-change-reason"><Icon.Spark size={17} /> {edit.explanation}</p>
              <div className="ac-agent-diff-list">
                {changes.map((change) => (
                  <div key={change.field}>
                    <strong>{change.label}</strong>
                    <span><del>{change.before}</del><Icon.Chevron size={16} /><ins>{change.after}</ins></span>
                  </div>
                ))}
              </div>
              <label className="ac-entry-review-check">
                <input checked={reviewed.has(key)} disabled={saving} onChange={(event) => setChecked(key, event.target.checked)} type="checkbox" />
                <span><Icon.Check size={17} /> Jag har kontrollerat denna ändring</span>
              </label>
            </article>
          );
        })}

        {proposal.deletes.map((deletion, index) => {
          const key = `delete-${deletion.id}`;
          return (
            <article className={`ac-card ac-agent-change-card is-delete ${reviewed.has(key) ? "is-reviewed" : ""}`} key={key}>
              <div className="ac-draft-card-heading">
                <div><span>{proposal.edits.length + index + 1}</span><h2>{deletion.current.description || "Bokföringspost"}</h2></div>
                <span className="ac-agent-change-kind is-delete"><Icon.Trash size={16} /> Ta bort</span>
              </div>
              <p className="ac-agent-change-reason"><Icon.Alert size={17} /> {deletion.explanation}</p>
              <dl className="ac-agent-delete-summary">
                <div><dt>Datum</dt><dd>{formatDate(deletion.current.date)}</dd></div>
                <div><dt>Belopp</dt><dd>{formatCurrency(deletion.current.amount)}</dd></div>
                <div><dt>Konto</dt><dd>{deletion.current.debitAccount || deletion.current.creditAccount || "Saknas"}</dd></div>
              </dl>
              <label className="ac-entry-review-check is-danger">
                <input checked={reviewed.has(key)} disabled={saving} onChange={(event) => setChecked(key, event.target.checked)} type="checkbox" />
                <span><Icon.Check size={17} /> Jag godkänner att denna post tas bort</span>
              </label>
            </article>
          );
        })}
      </div>

      {error && <p className="ac-form-error ac-form-error--block" role="alert"><Icon.Alert size={18} /> {error}</p>}

      <div className="ac-review-footer ac-agent-review-footer">
        <div><span>Förberedda</span><strong>{total}</strong><small>{reviewed.size} kontrollerade</small></div>
        <button className="ac-button ac-button--primary" disabled={saving || !allReviewed} onClick={() => void apply()} type="button">
          {saving ? <><span className="ac-button-spinner" /> Sparar atomiskt…</> : <><Icon.Check /> Godkänn alla</>}
        </button>
      </div>
      <p className="ac-review-assurance"><Icon.Shield size={16} /> Alla ändringar genomförs tillsammans. Om en post har ändrats på en annan enhet sparas ingenting.</p>
    </div>
  );
}

function AddView(props: ComposerProps) {
  return (
    <div className="ac-view ac-add-view">
      <PageHeading
        eyebrow="Ny verifikation"
        title="Låt AI göra grovjobbet"
        description="Beskriv köpet eller ladda upp underlaget. Du granskar och ändrar alltid innan något sparas."
      />
      <AiComposer {...props} />
      <section className="ac-trust-row" aria-label="Så fungerar AI-flödet">
        <div><span>1</span><strong>Ladda upp</strong><small>Foto, PDF, text eller kalkylark</small></div>
        <div><span>2</span><strong>AI tolkar</strong><small>Belopp, moms och konton föreslås</small></div>
        <div><span>3</span><strong>Du godkänner</strong><small>Inget sparas utan din kontroll</small></div>
      </section>
    </div>
  );
}

function AiComposer({
  agentMode = false,
  aiError,
  compact = false,
  files,
  loading,
  onAnalyze,
  onFiles,
  onManual,
  onText,
  progress,
  text,
}: ComposerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteError, setPasteError] = useState("");

  function appendFiles(nextFiles: File[]) {
    const allowed = nextFiles.filter((file) => file.size > 0);
    const merged = [...files];
    allowed.forEach((file) => {
      if (!merged.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified)) {
        merged.push(file);
      }
    });
    onFiles(merged);
  }

  function picked(event: ChangeEvent<HTMLInputElement>) {
    appendFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function pastedInTextarea(event: ClipboardEvent<HTMLTextAreaElement>) {
    const directFiles = Array.from(event.clipboardData.files);
    const itemFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const pastedFiles = directFiles.length > 0 ? directFiles : itemFiles;
    if (pastedFiles.length === 0) return;
    event.preventDefault();
    appendFiles(pastedFiles);
  }

  async function pasteFromClipboard() {
    setPasteError("");
    try {
      appendFiles(await readClipboardFiles());
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : "Kunde inte läsa urklippet.");
    }
  }

  function dropped(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    appendFiles(Array.from(event.dataTransfer.files));
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <section className={`ac-ai-composer ${compact ? "is-compact" : ""}`} aria-labelledby={compact ? "quick-ai-heading" : "new-ai-heading"}>
      <div className="ac-ai-orb" aria-hidden="true"><Icon.Spark size={compact ? 24 : 28} /></div>
      <div className="ac-ai-copy">
        <p className="ac-eyebrow">{agentMode ? "AI-agent" : "AI-assistent"}</p>
        <h2 id={compact ? "quick-ai-heading" : "new-ai-heading"}>
          {agentMode ? "Vad vill du göra?" : compact ? "Ny post med AI" : "Skapa ett utkast"}
        </h2>
        <p>
          {agentMode
            ? "Be AI hitta, analysera, skapa eller ändra poster. Den använder verktyg i din riktiga bokföring."
            : compact
              ? "Skriv eller lägg till flera kvitton samtidigt."
              : "AI delar upp materialet i separata, redigerbara bokföringsförslag som du kontrollerar ett i taget."}
        </p>
      </div>

      <label className="ac-ai-textarea">
        <span className="ac-visually-hidden">{agentMode ? "Beskriv uppdraget" : "Beskriv bokföringsposten"}</span>
        <textarea
          disabled={loading}
          onChange={(event) => onText(event.target.value)}
          onPaste={pastedInTextarea}
          placeholder={agentMode
            ? "T.ex. hitta alla OpenAI-poster i år, summera dem och ändra fel konto…"
            : "T.ex. Adobe Creative Cloud, 742,50 kr inkl. moms, betalt med företagskort…"}
          rows={compact ? 3 : 5}
          value={text}
        />
      </label>

      <div
        className={`ac-drop-zone ${dragging ? "is-dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropped}
      >
        <input
          accept="image/*"
          capture="environment"
          className="ac-visually-hidden"
          onChange={picked}
          ref={cameraRef}
          type="file"
        />
        <input
          accept="image/jpeg,image/png,.pdf,.txt,.csv"
          className="ac-visually-hidden"
          multiple
          onChange={picked}
          ref={filesRef}
          type="file"
        />
        <button className="ac-upload-button" disabled={loading} onClick={() => cameraRef.current?.click()} type="button">
          <span><Icon.Camera /></span>
          <strong>Ta foto</strong>
          <small>Kamera</small>
        </button>
        <button className="ac-upload-button" disabled={loading} onClick={() => filesRef.current?.click()} type="button">
          <span><Icon.Upload /></span>
          <strong>Välj underlag</strong>
          <small>Bild, PDF eller fil</small>
        </button>
        <button className="ac-upload-button" disabled={loading} onClick={() => void pasteFromClipboard()} type="button">
          <span><Icon.Clipboard /></span>
          <strong>Klistra in</strong>
          <small>Från urklipp</small>
        </button>
      </div>

      {pasteError && <p className="ac-form-error" role="alert"><Icon.Alert size={18} /> {pasteError}</p>}

      {files.length > 0 && (
        <div className="ac-file-section">
          <div className="ac-file-summary">
            <span>{files.length} {files.length === 1 ? "fil" : "filer"}</span>
            <span>{totalSize < 1_000_000 ? `${Math.max(1, Math.round(totalSize / 1000))} kB` : `${(totalSize / 1_000_000).toFixed(1).replace(".", ",")} MB`}</span>
          </div>
          <ul className="ac-file-list">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                <span className="ac-file-icon"><Icon.File size={18} /></span>
                <span><strong>{file.name}</strong><small>{file.type || "Fil"}</small></span>
                <button aria-label={`Ta bort ${file.name}`} onClick={() => onFiles(files.filter((_, fileIndex) => fileIndex !== index))} type="button"><Icon.Close size={18} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && progress && (
        <div className="ac-upload-progress" role="status" aria-live="polite">
          <div>
            <span>
              {progress.phase === "uploading"
                ? `Laddar upp ${progress.fileIndex + 1} av ${progress.fileCount}`
                : progress.phase === "preparing"
                  ? "Verifierar filen lokalt"
                : progress.phase === "finalizing"
                    ? "Registrerar underlaget säkert"
                    : agentMode ? "AI-agenten använder bokföringsverktygen" : "AI analyserar underlaget"}
            </span>
            <strong>{progress.phase === "analyzing" ? "Nästan klar" : `${progress.overallPercentage} %`}</strong>
          </div>
          <progress aria-label="Uppladdningsförlopp" max="100" value={progress.overallPercentage} />
          <small>{progress.fileName}</small>
        </div>
      )}

      {aiError && <p className="ac-form-error" role="alert"><Icon.Alert size={18} /> {aiError}</p>}

      <div className="ac-ai-actions">
        <button className="ac-button ac-button--ai" disabled={loading || (!text.trim() && files.length === 0)} onClick={onAnalyze} type="button">
          {loading
            ? <><span className="ac-button-spinner" /> {progress?.phase === "preparing" ? "Förbereder…" : progress?.phase === "uploading" ? "Laddar upp…" : progress?.phase === "finalizing" ? "Registrerar…" : agentMode ? "AI arbetar…" : "AI läser underlaget…"}</>
            : <><Icon.Spark /> {agentMode ? "Kör uppdrag" : "Skapa förslag"}</>}
        </button>
        <button className="ac-text-button" disabled={loading} onClick={onManual} type="button">
          Fyll i manuellt
        </button>
      </div>
      <p className="ac-ai-safety"><Icon.Shield size={16} /> {agentMode ? "AI får läsa allt. Varje ändring kräver ditt godkännande." : "Inget bokförs innan du granskar och godkänner."}</p>
    </section>
  );
}

function entryAttachmentStatus(entry: AccountingEntry): "has" | "missing" | "ignored" | "none" {
  const count = entry.documentCount ?? entry.documents.length;
  if (count > 0) return "has";
  if (!entry.receiptRequired) return "ignored";
  return entryTone(entry) === "expense" ? "missing" : "none";
}

function EntryRow({ entry, onClick }: { entry: AccountingEntry; onClick: () => void }) {
  const tone = entryTone(entry);
  const attachment = entryAttachmentStatus(entry);
  const documentCount = entry.documentCount ?? entry.documents.length;
  const account = entry.debitAccount || entry.creditAccount;
  return (
    <button className={`ac-entry-row is-${tone}`} onClick={onClick} type="button">
      <span className={`ac-entry-avatar is-${tone}`}><Icon.Receipt size={19} /></span>
      <span className="ac-entry-copy">
        <strong>{entry.description || "Bokföringspost"}</strong>
        <small>
          {formatDate(entry.date)}
          {account ? ` · ${account}` : ""} · {entryTypeLabel(entry)}
        </small>
        <span className="ac-entry-tags">
          {attachment === "has" && (
            <span className="ac-entry-tag is-attachment">
              <Icon.Paperclip size={13} /> {documentCount} {documentCount === 1 ? "bilaga" : "bilagor"}
            </span>
          )}
          {attachment === "missing" && (
            <span className="ac-entry-tag is-missing">
              <Icon.Alert size={13} /> Underlag saknas
            </span>
          )}
          {attachment === "ignored" && (
            <span className="ac-entry-tag is-ignored">
              <Icon.Check size={13} /> Underlag behövs inte
            </span>
          )}
        </span>
      </span>
      <span className="ac-entry-amount">
        <strong className={tone === "income" ? "ac-text-positive" : tone === "expense" ? "ac-text-negative" : ""}>{formatCurrency(entry.amount)}</strong>
      </span>
    </button>
  );
}

function EntryListSkeleton({ count }: { count: number }) {
  return (
    <div className="ac-entry-list" aria-label="Laddar poster">
      {Array.from({ length: count }, (_, index) => (
        <div className="ac-entry-row ac-entry-row--skeleton" key={index}><span /><span /><span /></div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="ac-empty-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function DraftReview({
  accounts,
  api,
  draft,
  onCancel,
  onChange,
  onExpired,
  onSaved,
}: {
  accounts: AccountingAccount[];
  api: AccountingApi;
  draft: AccountingDraft;
  onCancel: () => void;
  onChange: (draft: AccountingDraft) => void;
  onExpired: () => void;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState(false);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revisionNotice, setRevisionNotice] = useState("");
  const [error, setError] = useState("");
  const [reviewedEntryKeys, setReviewedEntryKeys] = useState<Set<string>>(() => new Set());

  function entryReviewKey(entry: DraftEntry, index: number) {
    return entry.id || `draft-entry-${index}`;
  }

  function updateEntry(index: number, patch: Partial<DraftEntry>) {
    const key = entryReviewKey(draft.entries[index], index);
    setReviewedEntryKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    onChange({
      ...draft,
      entries: draft.entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry),
    });
  }

  function removeEntry(index: number) {
    if (draft.entries.length === 1) return;
    const key = entryReviewKey(draft.entries[index], index);
    setReviewedEntryKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    onChange({ ...draft, entries: draft.entries.filter((_, entryIndex) => entryIndex !== index) });
  }

  function addEntry() {
    onChange({
      ...draft,
      entries: [...draft.entries, {
        ...createManualDraft().entries[0],
        id: `draft-row-${Date.now()}`,
        source: draft.manual ? "manual" : "ai",
      }],
    });
  }

  async function reviseBatch() {
    const instruction = revisionInstruction.trim();
    if (instruction.length < 2) {
      setError("Skriv vad AI ska ändra i utkasten.");
      return;
    }
    setRevising(true);
    setError("");
    setRevisionNotice("");
    try {
      const revised = await api.reviseDraft(draft, instruction);
      onChange(revised);
      setReviewedEntryKeys(new Set());
      setRevisionInstruction("");
      setRevisionNotice(
        `AI uppdaterade hela utkastet. Kontrollera alla ${revised.entries.length} ${revised.entries.length === 1 ? "post" : "poster"} igen.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (revisionError) {
      if (isUnauthorized(revisionError)) onExpired();
      else setError(displayError(revisionError, "AI kunde inte ändra utkasten. Dina nuvarande utkast är kvar."));
    } finally {
      setRevising(false);
    }
  }

  async function save() {
    const invalid = draft.entries.find((entry) => !entry.date || !entry.description.trim() || !Number.isFinite(asNumber(entry.amount)));
    if (invalid) {
      setError("Kontrollera att varje post har datum, beskrivning och ett giltigt belopp.");
      return;
    }
    if (!draft.manual) {
      const unreviewed = draft.entries.filter(
        (entry, index) => !reviewedEntryKeys.has(entryReviewKey(entry, index)),
      ).length;
      if (unreviewed > 0) {
        setError(`Kontrollera och markera alla poster först. ${unreviewed} återstår.`);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      if (draft.manual) {
        for (const entry of draft.entries) await api.createEntry(withoutReadOnlyFields(entry));
      } else {
        await api.approveDraft(draft);
      }
      onSaved(draft.entries.length > 1 ? `${draft.entries.length} poster har bokförts.` : "Posten har bokförts.");
    } catch (saveError) {
      if (isUnauthorized(saveError)) onExpired();
      else setError(displayError(saveError, "Kunde inte spara. Inget nytt har bokförts."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ac-view ac-review-view">
      <button className="ac-back-button" disabled={saving || revising} onClick={onCancel} type="button"><Icon.ArrowLeft /> Tillbaka</button>
      <div className="ac-review-heading">
        <div>
          <p className="ac-eyebrow">Steg 2 av 2</p>
          <h1>Granska före bokföring</h1>
          <p>AI har bara gjort ett förslag. Kontrollera belopp, moms och konton noggrant.</p>
        </div>
        <span className="ac-review-badge"><Icon.Shield size={18} /> Ej sparat</span>
      </div>

      {draft.entries.length > 1 && (
        <nav className="ac-draft-nav" aria-label="Hoppa mellan AI-förslag">
          <strong>{draft.entries.length} separata förslag</strong>
          <div>
            {draft.entries.map((entry, index) => {
              const key = entryReviewKey(entry, index);
              const reviewed = reviewedEntryKeys.has(key);
              return (
                <button
                  aria-label={`Gå till post ${index + 1}: ${entry.description || "utan beskrivning"}`}
                  className={reviewed ? "is-reviewed" : ""}
                  key={key}
                  onClick={() => document.getElementById(`ac-draft-entry-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  type="button"
                >
                  {reviewed ? <Icon.Check size={15} /> : index + 1}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {draft.warnings.length > 0 && (
        <div className="ac-warning-box" role="status">
          <Icon.Alert />
          <div>
            <strong>Behöver din kontroll</strong>
            <ul>{draft.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
          </div>
        </div>
      )}

      {!draft.manual && (
        <section className="ac-card ac-ai-batch-editor" aria-busy={revising}>
          <div className="ac-ai-batch-editor__heading">
            <span><Icon.Spark size={20} /></span>
            <div>
              <strong>Be AI ändra hela utkastet</strong>
              <p>Beskriv en ändring för en eller flera poster. AI returnerar alltid hela bunten för ny kontroll.</p>
            </div>
          </div>
          <textarea
            disabled={saving || revising}
            maxLength={4000}
            onChange={(event) => {
              setRevisionInstruction(event.target.value);
              setError("");
            }}
            placeholder="Exempel: Ändra konto på alla taxiresor till 5800, behåll övriga poster och förklara ändringarna."
            rows={3}
            value={revisionInstruction}
          />
          <button
            className="ac-button ac-button--secondary"
            disabled={saving || revising || revisionInstruction.trim().length < 2}
            onClick={() => void reviseBatch()}
            type="button"
          >
            {revising ? <><span className="ac-button-spinner" /> AI uppdaterar alla…</> : <><Icon.Spark /> Uppdatera hela bunten med AI</>}
          </button>
          {revisionNotice && <p className="ac-ai-batch-editor__notice" role="status"><Icon.Check size={17} /> {revisionNotice}</p>}
        </section>
      )}

      <div className="ac-draft-stack">
        {draft.entries.map((entry, index) => (
          <article
            className={`ac-card ac-draft-card ${reviewedEntryKeys.has(entryReviewKey(entry, index)) ? "is-reviewed" : ""}`}
            id={`ac-draft-entry-${index}`}
            key={entry.id || index}
          >
            <div className="ac-draft-card-heading">
              <div><span>{index + 1}</span><h2>{entry.description || "Ny bokföringspost"}</h2></div>
              {draft.entries.length > 1 && (
                <button aria-label={`Ta bort post ${index + 1}`} className="ac-icon-button ac-icon-button--danger" disabled={saving || revising} onClick={() => removeEntry(index)} type="button"><Icon.Trash size={19} /></button>
              )}
            </div>
            {entry.reasoning && (
              <div className="ac-ai-reasoning">
                <Icon.Spark size={17} />
                <p><strong>AI:s bedömning{entry.confidence != null ? ` · ${Math.round(entry.confidence * 100)} % säkerhet` : ""}</strong>{entry.reasoning}</p>
              </div>
            )}
            <EntryFields accounts={accounts} disabled={saving || revising} entry={entry} onChange={(patch) => updateEntry(index, patch)} />
            {!draft.manual && (
              <label className="ac-entry-review-check">
                <input
                  checked={reviewedEntryKeys.has(entryReviewKey(entry, index))}
                  disabled={saving || revising}
                  onChange={(event) => {
                    const key = entryReviewKey(entry, index);
                    setReviewedEntryKeys((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(key);
                      else next.delete(key);
                      return next;
                    });
                    setError("");
                  }}
                  type="checkbox"
                />
                <span><Icon.Check size={17} /> Jag har kontrollerat denna post</span>
              </label>
            )}
          </article>
        ))}
      </div>

      <button className="ac-add-row-button" disabled={saving || revising} onClick={addEntry} type="button"><Icon.Plus /> Lägg till ytterligare rad</button>

      {error && <p className="ac-form-error ac-form-error--block" role="alert"><Icon.Alert size={18} /> {error}</p>}

      <div className="ac-review-footer">
        <div>
          <span>Totalt</span>
          <strong>{formatCurrency(draft.entries.reduce((sum, entry) => sum + asNumber(entry.amount), 0))}</strong>
          <small>{draft.entries.length} {draft.entries.length === 1 ? "post" : "poster"}</small>
        </div>
        <button className="ac-button ac-button--primary" disabled={saving || revising} onClick={() => void save()} type="button">
          {saving ? <><span className="ac-button-spinner" /> Sparar säkert…</> : <><Icon.Check /> Godkänn och bokför</>}
        </button>
      </div>
      <p className="ac-review-assurance"><Icon.Shield size={16} /> Först när du trycker på “Godkänn och bokför” skickas godkännandet.</p>
    </div>
  );
}

function AccountSelect({
  accounts,
  disabled,
  value,
  onChange,
}: {
  accounts: AccountingAccount[];
  disabled?: boolean;
  value: string | number | null | undefined;
  onChange: (account: AccountingAccount | null, value: string) => void;
}) {
  const selected = value == null ? "" : String(value);
  const currentExists = accounts.some((account) => String(account.account) === selected);
  return (
    <select
      disabled={disabled}
      onChange={(event) => {
        const nextValue = event.target.value;
        onChange(
          accounts.find((account) => String(account.account) === nextValue) ?? null,
          nextValue,
        );
      }}
      value={selected}
    >
      <option value="">Välj konto…</option>
      {selected && !currentExists && <option value={selected}>{selected} — Nuvarande konto</option>}
      {accounts.map((account) => (
        <option key={account.id || account.account} value={account.account}>
          {account.account} — {account.name}
        </option>
      ))}
    </select>
  );
}

function EntryFields({
  accounts,
  disabled = false,
  entry,
  onChange,
}: {
  accounts: AccountingAccount[];
  disabled?: boolean;
  entry: DraftEntry | AccountingEntry;
  onChange: (patch: Partial<DraftEntry>) => void;
}) {
  return (
    <div className="ac-entry-fields">
      <label className="ac-field">
        <span>Datum</span>
        <input disabled={disabled} type="date" value={entry.date || ""} onChange={(event) => onChange({ date: event.target.value })} />
      </label>
      <label className="ac-field ac-field--wide">
        <span>Beskrivning</span>
        <input autoComplete="off" disabled={disabled} placeholder="Vad gäller posten?" value={entry.description || ""} onChange={(event) => onChange({ description: event.target.value })} />
      </label>
      <label className="ac-field">
        <span>Typ</span>
        <select disabled={disabled} value={canonicalEntryType(entry.type)} onChange={(event) => onChange({ type: event.target.value })}>
          <option value="Utbetalning">Kostnad (utbetalning)</option>
          <option value="Inbetalning">Intäkt (inbetalning)</option>
          <option value="Överföring">Överföring</option>
          <option value="Skuld">Skuld / övrigt</option>
        </select>
      </label>
      <label className="ac-field">
        <span>Totalbelopp</span>
        <span className="ac-money-input">
          <input disabled={disabled} inputMode="decimal" min="0" step="0.01" type="number" value={entry.amount ?? 0} onChange={(event) => onChange({ amount: asNumber(event.target.value) })} />
          <span>SEK</span>
        </span>
      </label>
      <label className="ac-field">
        <span>Exkl. moms</span>
        <span className="ac-money-input">
          <input disabled={disabled} inputMode="decimal" min="0" placeholder="0,00" step="0.01" type="number" value={entry.beloppExMoms ?? ""} onChange={(event) => onChange({ beloppExMoms: event.target.value === "" ? null : asNumber(event.target.value) })} />
          <span>SEK</span>
        </span>
      </label>
      <label className="ac-field">
        <span>Moms</span>
        <span className="ac-money-input">
          <input disabled={disabled} inputMode="decimal" min="0" placeholder="0,00" step="0.01" type="number" value={entry.moms ?? ""} onChange={(event) => onChange({ moms: event.target.value === "" ? null : asNumber(event.target.value) })} />
          <span>SEK</span>
        </span>
      </label>
      <fieldset className="ac-account-group ac-field--wide" disabled={disabled}>
        <legend>Debet</legend>
        <label className="ac-field">
          <span>Konto</span>
          <AccountSelect
            accounts={accounts}
            disabled={disabled}
            onChange={(account, accountValue) => onChange({
              debitAccount: accountValue,
              debitName: account?.name ?? (accountValue ? entry.debitName : ""),
            })}
            value={entry.debitAccount}
          />
        </label>
        <label className="ac-field">
          <span>Kontonamn</span>
          <input disabled={disabled} placeholder="T.ex. IT-tjänster" value={entry.debitName || ""} onChange={(event) => onChange({ debitName: event.target.value })} />
        </label>
      </fieldset>
      <fieldset className="ac-account-group ac-field--wide" disabled={disabled}>
        <legend>Kredit</legend>
        <label className="ac-field">
          <span>Konto</span>
          <AccountSelect
            accounts={accounts}
            disabled={disabled}
            onChange={(account, accountValue) => onChange({
              creditAccount: accountValue,
              creditName: account?.name ?? (accountValue ? entry.creditName : ""),
            })}
            value={entry.creditAccount}
          />
        </label>
        <label className="ac-field">
          <span>Kontonamn</span>
          <input disabled={disabled} placeholder="T.ex. Företagskonto" value={entry.creditName || ""} onChange={(event) => onChange({ creditName: event.target.value })} />
        </label>
      </fieldset>
      <label className="ac-field">
        <span>Momskonto</span>
        <AccountSelect
          accounts={accounts}
          disabled={disabled}
          onChange={(_, accountValue) => onChange({ momsAccount: accountValue })}
          value={entry.momsAccount}
        />
      </label>
      <label className="ac-field ac-field--wide">
        <span>Anteckning</span>
        <textarea disabled={disabled} placeholder="Valfri intern anteckning" rows={3} value={entry.notes || ""} onChange={(event) => onChange({ notes: event.target.value })} />
      </label>
    </div>
  );
}

function LedgerView({
  docFilter,
  entries,
  error,
  loading,
  onDocFilter,
  onOpenEntry,
  onRetry,
}: {
  docFilter: "all" | "missing";
  entries: AccountingEntry[];
  error: string;
  loading: boolean;
  onDocFilter: (filter: "all" | "missing") => void;
  onOpenEntry: (entry: AccountingEntry) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [year, setYear] = useState("all");

  const years = useMemo(() => Array.from(new Set(entries.map((entry) => entry.date.slice(0, 4)).filter(Boolean))).sort().reverse(), [entries]);
  const missingCount = useMemo(
    () => entries.filter((entry) => entryAttachmentStatus(entry) === "missing").length,
    [entries],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("sv-SE");
    return entries
      .filter((entry) => {
        if (year !== "all" && !entry.date.startsWith(year)) return false;
        if (type !== "all" && entryTone(entry) !== type) return false;
        if (docFilter === "missing" && entryAttachmentStatus(entry) !== "missing") return false;
        if (!normalizedQuery) return true;
        const haystack = [
          entry.description,
          entry.legacyId,
          entry.debitAccount,
          entry.debitName,
          entry.creditAccount,
          entry.creditName,
          entry.notes,
          entry.amount,
        ].filter(Boolean).join(" ").toLocaleLowerCase("sv-SE");
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [docFilter, entries, query, type, year]);

  const hasActiveFilter = Boolean(query) || type !== "all" || year !== "all" || docFilter !== "all";

  return (
    <div className="ac-view ac-ledger-view">
      <PageHeading eyebrow="Huvudbok" title="Alla poster" />
      <div className="ac-ledger-toolbar">
        <label className="ac-search-field">
          <span className="ac-visually-hidden">Sök poster</span>
          <Icon.Search size={19} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Sök beskrivning, belopp, konto…" type="search" value={query} />
          {query && <button aria-label="Rensa sökning" onClick={() => setQuery("")} type="button"><Icon.Close size={16} /></button>}
        </label>
        <div className="ac-filter-row">
          <button
            className={`ac-filter-chip ${docFilter === "missing" ? "is-active is-warning" : ""}`}
            onClick={() => onDocFilter(docFilter === "missing" ? "all" : "missing")}
            type="button"
          >
            <Icon.Alert size={15} /> Saknar underlag{missingCount > 0 ? ` (${missingCount})` : ""}
          </button>
          <label className="ac-filter-select">
            <span className="ac-visually-hidden">Filtrera typ</span>
            <select onChange={(event) => setType(event.target.value)} value={type}>
              <option value="all">Alla typer</option>
              <option value="income">Intäkter</option>
              <option value="expense">Kostnader</option>
              <option value="neutral">Övrigt</option>
            </select>
          </label>
          <label className="ac-filter-select">
            <span className="ac-visually-hidden">Filtrera år</span>
            <select onChange={(event) => setYear(event.target.value)} value={year}>
              <option value="all">Alla år</option>
              {years.map((entryYear) => <option key={entryYear} value={entryYear}>{entryYear}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="ac-ledger-result-row">
        <span>{filtered.length} {filtered.length === 1 ? "post" : "poster"}</span>
        {hasActiveFilter && (
          <button onClick={() => { setQuery(""); setType("all"); setYear("all"); onDocFilter("all"); }} type="button">
            Rensa filter
          </button>
        )}
      </div>

      {loading && entries.length === 0 ? (
        <EntryListSkeleton count={7} />
      ) : error && entries.length === 0 ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : filtered.length ? (
        <div className="ac-entry-list ac-entry-list--ledger">
          {filtered.map((entry) => <EntryRow entry={entry} key={entry.id} onClick={() => onOpenEntry(entry)} />)}
        </div>
      ) : (
        <EmptyState
          icon={docFilter === "missing" ? <Icon.Check /> : <Icon.Search />}
          title={docFilter === "missing" && !query ? "Allt har underlag" : entries.length ? "Inga träffar" : "Inga bokföringsposter"}
          description={docFilter === "missing" && !query ? "Inga kostnadsposter saknar bilagor just nu." : entries.length ? "Prova ett annat sökord eller rensa filtren." : "Importerade och nya poster visas här när de finns."}
        />
      )}
    </div>
  );
}

function EntryEditor({
  accessKey,
  accounts,
  api,
  entry,
  loading,
  onBack,
  onChange,
  onDeleted,
  onExpired,
  onSaved,
}: {
  accessKey: string;
  accounts: AccountingAccount[];
  api: AccountingApi;
  entry: AccountingEntry;
  loading: boolean;
  onBack: () => void;
  onChange: (entry: AccountingEntry) => void;
  onDeleted: () => void;
  onExpired: () => void;
  onSaved: (entry: AccountingEntry) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [documentProgress, setDocumentProgress] = useState<AccountingUploadProgress | null>(null);
  const [documentStatus, setDocumentStatus] = useState("");
  const [revisions, setRevisions] = useState<AccountingRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(true);
  const [revisionsError, setRevisionsError] = useState("");
  const [confirmDocumentId, setConfirmDocumentId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<AccountingDocument | null>(null);
  const [savingReceiptRequirement, setSavingReceiptRequirement] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const documentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setRevisionsLoading(true);
    setRevisionsError("");
    void api.revisions(entry.id)
      .then((nextRevisions) => { if (active) setRevisions(nextRevisions); })
      .catch((revisionError) => {
        if (!active) return;
        if (isUnauthorized(revisionError)) onExpired();
        else setRevisionsError(displayError(revisionError, "Historiken kunde inte hämtas."));
      })
      .finally(() => { if (active) setRevisionsLoading(false); });
    return () => { active = false; };
  }, [api, entry.id, entry.version, onExpired]);

  function patchEntry(patch: Partial<DraftEntry>) {
    onChange({ ...entry, ...patch } as AccountingEntry);
  }

  async function save() {
    if (!entry.date || !entry.description.trim()) {
      setError("Datum och beskrivning måste fyllas i.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      onSaved(await api.updateEntry(entry.id, withoutReadOnlyFields(entry)));
    } catch (saveError) {
      if (isUnauthorized(saveError)) onExpired();
      else setError(displayError(saveError, "Kunde inte spara ändringarna."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await api.deleteEntry(entry.id, entry.version);
      onDeleted();
    } catch (deleteError) {
      if (isUnauthorized(deleteError)) onExpired();
      else setError(displayError(deleteError, "Kunde inte ta bort posten."));
    } finally {
      setDeleting(false);
    }
  }

  async function addDocuments(files: File[]) {
    if (!files.length) return;
    setUploadingDocuments(true);
    setDocumentProgress(null);
    setDocumentStatus("");
    setError("");
    try {
      await api.uploadDocuments(files, setDocumentProgress, entry.id);
      const refreshed = await api.entry(entry.id);
      onSaved(refreshed);
      setDocumentStatus(files.length === 1 ? "Underlaget är kopplat till posten." : `${files.length} underlag är kopplade till posten.`);
    } catch (uploadError) {
      if (isUnauthorized(uploadError)) onExpired();
      else setError(displayError(uploadError, "Kunde inte ladda upp underlaget."));
    } finally {
      setUploadingDocuments(false);
      setDocumentProgress(null);
    }
  }

  function pickedDocuments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void addDocuments(files);
  }

  async function pasteDocuments() {
    setError("");
    setDocumentStatus("");
    let files: File[];
    try {
      files = await readClipboardFiles();
    } catch (pasteError) {
      setError(pasteError instanceof Error ? pasteError.message : "Kunde inte läsa urklippet.");
      return;
    }
    await addDocuments(files);
  }

  async function deleteDocument(document: AccountingDocument) {
    if (!document.id || document.version == null) return;
    setDeletingDocumentId(document.id);
    setError("");
    try {
      await api.deleteDocument(document.id, document.version);
      const refreshed = await api.entry(entry.id);
      onSaved(refreshed);
      setConfirmDocumentId(null);
      setDocumentStatus("Underlaget har tagits bort från posten.");
    } catch (deleteError) {
      if (isUnauthorized(deleteError)) onExpired();
      else setError(displayError(deleteError, "Kunde inte ta bort underlaget."));
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function setReceiptNotRequired(checked: boolean) {
    setSavingReceiptRequirement(true);
    setDocumentStatus("");
    setError("");
    try {
      const refreshed = await api.updateEntry(entry.id, {
        receiptRequired: !checked,
        version: entry.version,
      });
      onSaved(refreshed);
      setDocumentStatus(checked
        ? "Posten ignoreras nu i listan över saknade underlag."
        : "Posten räknas åter som att underlag saknas.");
    } catch (requirementError) {
      if (isUnauthorized(requirementError)) onExpired();
      else setError(displayError(requirementError, "Kunde inte ändra kravet på underlag."));
    } finally {
      setSavingReceiptRequirement(false);
    }
  }

  return (
    <div className="ac-view ac-entry-detail-view">
      <button className="ac-back-button" onClick={onBack} type="button"><Icon.ArrowLeft /> Alla poster</button>
      <div className="ac-detail-heading">
        <div>
          <p className="ac-eyebrow">{entry.legacyId ? `Verifikation ${entry.legacyId}` : "Bokföringspost"}</p>
          <h1>{entry.description || "Bokföringspost"}</h1>
          <p>{formatDate(entry.date)} · Version {entry.version ?? 1}</p>
        </div>
        <strong className={`ac-detail-amount is-${entryTone(entry)}`}>{formatCurrency(entry.amount)}</strong>
      </div>

      {loading && <div className="ac-inline-loading" role="status"><span className="ac-loader" /> Hämtar underlag och senaste version…</div>}

      <div className="ac-detail-grid">
        <section className="ac-card ac-entry-editor-card" aria-labelledby="edit-entry-heading">
          <div className="ac-section-heading-row">
            <div><p className="ac-eyebrow">Redigera</p><h2 id="edit-entry-heading">Postens uppgifter</h2></div>
            <span className="ac-section-icon"><Icon.Edit size={20} /></span>
          </div>
          <EntryFields accounts={accounts} disabled={saving || deleting} entry={entry} onChange={patchEntry} />
          {error && <p className="ac-form-error ac-form-error--block" role="alert"><Icon.Alert size={18} /> {error}</p>}
          <div className="ac-editor-actions">
            <button className="ac-button ac-button--primary" disabled={saving || deleting} onClick={() => void save()} type="button">
              {saving ? <><span className="ac-button-spinner" /> Sparar…</> : <><Icon.Check /> Spara ändringar</>}
            </button>
          </div>
        </section>

        <aside className="ac-detail-sidebar">
          <section className="ac-card ac-documents-card" aria-labelledby="documents-heading">
            <div className="ac-section-heading-row">
              <div><p className="ac-eyebrow">Underlag</p><h2 id="documents-heading">Bilagor</h2></div>
              <div className="ac-document-actions">
                <span className="ac-count-badge">{entry.documents.length}</span>
                <input
                  accept="image/*,.pdf,.txt,.csv"
                  className="ac-visually-hidden"
                  multiple
                  onChange={pickedDocuments}
                  ref={documentInputRef}
                  type="file"
                />
                <button
                  aria-label="Klistra in underlag från urklipp"
                  className="ac-mini-add-button"
                  disabled={uploadingDocuments}
                  onClick={() => void pasteDocuments()}
                  type="button"
                >
                  <Icon.Clipboard size={17} /> Klistra in
                </button>
              </div>
            </div>
            {uploadingDocuments && documentProgress && (
              <div className="ac-document-upload-progress" role="status">
                <div><span>{documentProgress.phase === "preparing" ? "Verifierar fil…" : documentProgress.phase === "uploading" ? `Laddar upp ${documentProgress.fileIndex + 1}/${documentProgress.fileCount}` : "Registrerar…"}</span><strong>{documentProgress.overallPercentage} %</strong></div>
                <progress aria-label="Uppladdningsförlopp" max="100" value={documentProgress.overallPercentage} />
              </div>
            )}
            {documentStatus && <p className="ac-document-success" role="status"><Icon.Check size={16} /> {documentStatus}</p>}
            <div className="ac-document-preview-grid">
              {entry.documents.map((document, index) => {
                const url = documentUrl(document, accessKey);
                const name = documentName(document, index);
                return (
                  <div className="ac-document-preview" key={document.id || `${name}-${index}`}>
                    <button
                      aria-label={`Förhandsvisa ${name}`}
                      disabled={!url}
                      onClick={() => setPreviewDocument(document)}
                      type="button"
                    >
                      {isImageDocument(document) && url ? (
                        <>
                          {/* Protected receipt URLs cannot use the server-side Next image optimizer. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt="" loading="lazy" src={url} />
                        </>
                      ) : (
                        <span className="ac-document-file-preview">
                          <Icon.File size={28} />
                          <small>{isPdfDocument(document) ? "PDF" : (document.mimeType || "FIL").split("/").pop()?.toLocaleUpperCase("sv-SE")}</small>
                        </span>
                      )}
                      <span className="ac-document-preview-name">{name}</span>
                    </button>
                    {document.id && document.version != null && (
                      <button
                        aria-label={`Ta bort ${name}`}
                        className="ac-document-preview-delete"
                        disabled={deletingDocumentId === document.id}
                        onClick={() => setConfirmDocumentId(document.id!)}
                        type="button"
                      >
                        <Icon.Trash size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                aria-label="Lägg till bilagor från filer, bilder eller kamera"
                className="ac-document-add-preview"
                disabled={uploadingDocuments}
                onClick={() => documentInputRef.current?.click()}
                type="button"
              >
                <span><Icon.Plus size={28} /></span>
                <small>Lägg till</small>
              </button>
            </div>
            {entry.documents.length === 0 && entryTone(entry) === "expense" && (
              <label className="ac-receipt-not-required">
                <input
                  checked={!entry.receiptRequired}
                  disabled={savingReceiptRequirement}
                  onChange={(event) => void setReceiptNotRequired(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Underlag behövs inte för denna post</strong>
                  <small>Posten ignoreras i Saknar underlag.</small>
                </span>
              </label>
            )}
            {confirmDocumentId && (() => {
              const document = entry.documents.find((item) => item.id === confirmDocumentId);
              if (!document) return null;
              return (
                <div className="ac-document-delete-confirm" role="alert">
                  <span>Ta bort {documentName(document, 0)}?</span>
                  <button disabled={deletingDocumentId === document.id} onClick={() => void deleteDocument(document)} type="button">Ja, ta bort</button>
                  <button disabled={deletingDocumentId === document.id} onClick={() => setConfirmDocumentId(null)} type="button">Avbryt</button>
                </div>
              );
            })()}
          </section>

          <section className="ac-card ac-history-card" aria-labelledby="history-heading">
            <div className="ac-section-heading-row">
              <div><p className="ac-eyebrow">Spårbarhet</p><h2 id="history-heading">Ändringshistorik</h2></div>
              <span className="ac-count-badge">{revisions.length}</span>
            </div>
            {revisionsLoading ? (
              <div className="ac-history-loading"><span className="ac-loader" /> Hämtar historik…</div>
            ) : revisionsError ? (
              <p className="ac-muted-copy">{revisionsError}</p>
            ) : revisions.length ? (
              <ol className="ac-history-list">
                {revisions.map((revision) => (
                  <li key={revision.id}>
                    <span />
                    <div>
                      <strong>{revisionActionLabel(revision.action)} · version {revision.version}</strong>
                      <small>{formatDateTime(revision.createdAt)}{revision.actor ? ` · ${revision.actor}` : ""}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="ac-muted-copy">Ingen ändringshistorik har registrerats ännu.</p>
            )}
          </section>

          <section className="ac-card ac-danger-card" aria-labelledby="danger-heading">
            <h2 id="danger-heading">Ta bort post</h2>
            {!confirmDelete ? (
              <>
                <p>Posten tas bort från huvudboken. Använd bara detta om den verkligen är felaktig.</p>
                <button className="ac-button ac-button--danger-ghost" onClick={() => setConfirmDelete(true)} type="button"><Icon.Trash size={18} /> Ta bort…</button>
              </>
            ) : (
              <div className="ac-delete-confirm" role="alert">
                <strong>Är du helt säker?</strong>
                <p>Det här går inte att ångra i appen.</p>
                <div>
                  <button className="ac-button ac-button--danger" disabled={deleting} onClick={() => void remove()} type="button">
                    {deleting ? "Tar bort…" : "Ja, ta bort posten"}
                  </button>
                  <button className="ac-button ac-button--secondary" disabled={deleting} onClick={() => setConfirmDelete(false)} type="button">Avbryt</button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
      {previewDocument && documentUrl(previewDocument, accessKey) && (
        <DocumentViewer
          document={previewDocument}
          name={documentName(previewDocument, Math.max(entry.documents.indexOf(previewDocument), 0))}
          onClose={() => setPreviewDocument(null)}
          url={documentUrl(previewDocument, accessKey)}
        />
      )}
    </div>
  );
}

function SettingsView({
  api,
  dashboard,
  onBackupComplete,
  onExpired,
  onLogout,
  onLogoutAll,
}: {
  api: AccountingApi;
  dashboard: DashboardData | null;
  onBackupComplete: () => Promise<void>;
  onExpired: () => void;
  onLogout: () => void;
  onLogoutAll: () => void;
}) {
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState("");

  async function createBackup() {
    setBackupLoading(true);
    setBackupMessage("");
    setBackupError("");
    try {
      await api.createBackup();
      await onBackupComplete();
      setBackupMessage("En ny verifierad backup har skapats.");
    } catch (error) {
      if (isUnauthorized(error)) onExpired();
      else setBackupError(displayError(error, "Kunde inte skapa backup just nu."));
    } finally {
      setBackupLoading(false);
    }
  }

  return (
    <div className="ac-view ac-settings-view">
      <PageHeading eyebrow="Mer" title="Trygg åtkomst" description="Installera appen, kontrollera backupstatus och hantera din session." />
      <div className="ac-settings-grid">
        <div className="ac-settings-main">
          <section className="ac-card ac-backup-card" aria-labelledby="backup-heading">
            <div className={`ac-section-icon ${dashboard?.backup?.status === "error" ? "is-error" : ""}`}><Icon.Cloud /></div>
            <div>
              <p className="ac-eyebrow">Dataskydd</p>
              <h2 id="backup-heading">Säkerhetskopiering</h2>
              <p className="ac-backup-status-line">
                <span className={`ac-backup-dot ${dashboard?.backup?.status === "error" ? "is-error" : ""}`} />
                {dashboard?.backup?.status === "error" ? "Backup kräver kontroll" : dashboard?.backup?.lastAt ? "Senaste backup rapporterad" : "Väntar på backupstatus"}
              </p>
              <strong className="ac-backup-time">{formatDateTime(dashboard?.backup?.lastAt)}</strong>
              <p className="ac-help-text">Appen visar serverns rapporterade status. Behåll även originalet på datorn tills den första online-backupen har verifierats.</p>
              <button className="ac-button ac-button--secondary" disabled={backupLoading} onClick={() => void createBackup()} type="button">
                {backupLoading ? <><span className="ac-button-spinner" /> Skapar backup…</> : <><Icon.Cloud size={18} /> Skapa backup nu</>}
              </button>
              {backupMessage && <p className="ac-success-copy" role="status"><Icon.Check size={16} /> {backupMessage}</p>}
              {backupError && <p className="ac-settings-error" role="alert"><Icon.Alert size={16} /> {backupError}</p>}
            </div>
          </section>

          <PwaRegistration visible />

          <section className="ac-card ac-security-card" aria-labelledby="security-heading">
            <div className="ac-section-icon"><Icon.Shield /></div>
            <div>
              <p className="ac-eyebrow">Privat</p>
              <h2 id="security-heading">Din inloggning</h2>
              <ul className="ac-check-list">
                <li><Icon.Check size={17} /> Privat länk och lösenord krävs</li>
                <li><Icon.Check size={17} /> API-svar lagras inte av PWA:n</li>
                <li><Icon.Check size={17} /> Utloggning stänger den här sessionen</li>
              </ul>
            </div>
          </section>

          <GmailManager api={api} onExpired={onExpired} />

          <AccountsManager api={api} onExpired={onExpired} />
        </div>

        <aside className="ac-settings-sidebar">
          <section className="ac-card ac-session-card">
            <span className="ac-section-icon ac-section-icon--muted"><Icon.Logout /></span>
            <h2>Avsluta session</h2>
            <p>Logga ut när du använder en lånad eller offentlig enhet.</p>
            <button className="ac-button ac-button--secondary ac-button--full" onClick={onLogout} type="button"><Icon.Logout /> Logga ut</button>
            <button
              className="ac-button ac-button--ghost ac-button--full"
              onClick={() => {
                if (window.confirm("Logga ut alla enheter som är anslutna till bokföringen?")) onLogoutAll();
              }}
              type="button"
            >
              <Icon.Shield /> Logga ut alla enheter
            </button>
          </section>
          <section className="ac-support-note">
            <Icon.Info size={19} />
            <p>Ser något fel ut? Ändra inte originalfilen i onödan. Ta först en kopia och kontrollera senaste backup.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function GmailManager({ api, onExpired }: { api: AccountingApi; onExpired: () => void }) {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectedMessage, setConnectedMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.gmailAccounts();
      setAccounts(result.accounts);
      setConfigured(result.configured);
    } catch (loadError) {
      if (isUnauthorized(loadError)) onExpired();
      else setError(displayError(loadError, "Gmail-kontona kunde inte hämtas."));
    } finally {
      setLoading(false);
    }
  }, [api, onExpired]);

  useEffect(() => { void load(); }, [load]);

  function openForm(prefillEmail = "") {
    setFormOpen(true);
    setEmail(prefillEmail);
    setAppPassword("");
    setError("");
    setConnectedMessage("");
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !appPassword.trim()) {
      setError("Fyll i både Gmail-adressen och app-lösenordet.");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const account = await api.connectGmailAccount(email.trim(), appPassword);
      setAccounts((current) => [
        ...current.filter((item) => item.id !== account.id && item.email !== account.email),
        account,
      ]);
      setFormOpen(false);
      setEmail("");
      setAppPassword("");
      setConnectedMessage(`${account.email} är ansluten. AI-agenten kan nu söka i inkorgen.`);
    } catch (connectError) {
      if (isUnauthorized(connectError)) onExpired();
      else setError(displayError(connectError, "Kontot kunde inte anslutas. Kontrollera adressen och app-lösenordet."));
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect(account: GmailAccount) {
    if (!window.confirm(`Koppla bort ${account.email}? AI-agenten kan då inte längre söka i den inkorgen.`)) return;
    setBusyId(account.id);
    setError("");
    setConnectedMessage("");
    try {
      await api.disconnectGmailAccount(account.id);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
    } catch (disconnectError) {
      if (isUnauthorized(disconnectError)) onExpired();
      else setError(displayError(disconnectError, "Kontot kunde inte kopplas bort."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="ac-card ac-gmail-card" aria-labelledby="gmail-heading">
      <div className="ac-section-heading-row">
        <div><p className="ac-eyebrow">AI-agenten</p><h2 id="gmail-heading">Gmail-konton</h2></div>
        {configured && (
          <button className="ac-mini-add-button" onClick={() => (formOpen ? setFormOpen(false) : openForm())} type="button">
            {formOpen ? <Icon.Close size={17} /> : <Icon.Plus size={17} />} {formOpen ? "Stäng" : "Anslut konto"}
          </button>
        )}
      </div>
      <p className="ac-account-intro">
        Anslutna inkorgar kan AI-agenten söka i (endast läsning) för att hitta kvitton och underlag till verifikationerna.
      </p>

      {formOpen && (
        <form className="ac-gmail-form" onSubmit={(event) => void connect(event)}>
          <ol className="ac-gmail-howto">
            <li>Öppna <a href="https://myaccount.google.com/apppasswords" rel="noreferrer" target="_blank">myaccount.google.com/apppasswords</a> inloggad på kontot du vill ansluta. (Kräver att 2-stegsverifiering är på — slå på den under Säkerhet om sidan säger nej.)</li>
            <li>Skapa ett app-lösenord, döp det till t.ex. ”Bokföring”.</li>
            <li>Kopiera det 16 tecken långa lösenordet och klistra in det här.</li>
          </ol>
          <label className="ac-field">
            <span>Gmail-adress</span>
            <input
              autoComplete="off"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="namn@gmail.com"
              type="email"
              value={email}
            />
          </label>
          <label className="ac-field">
            <span>App-lösenord</span>
            <input
              autoComplete="off"
              onChange={(event) => setAppPassword(event.target.value)}
              placeholder="xxxx xxxx xxxx xxxx"
              type="password"
              value={appPassword}
            />
          </label>
          <button className="ac-button ac-button--primary" disabled={connecting} type="submit">
            {connecting ? <><span className="ac-button-spinner" /> Kontrollerar inloggningen…</> : <><Icon.Check size={18} /> Anslut inkorgen</>}
          </button>
          <p className="ac-help-text">Lösenordet testas mot Gmail direkt och sparas krypterat. Det ger bara läsåtkomst via appen och kan återkallas när som helst på samma Google-sida.</p>
        </form>
      )}

      {error && <p className="ac-settings-error" role="alert"><Icon.Alert size={16} /> {error}</p>}
      {connectedMessage && <p className="ac-success-copy" role="status"><Icon.Check size={16} /> {connectedMessage}</p>}

      {!configured ? (
        <p className="ac-help-text">Gmail-anslutningen är inte konfigurerad på servern ännu (krypteringsnyckel saknas).</p>
      ) : loading ? (
        <div className="ac-history-loading"><span className="ac-loader" /> Hämtar Gmail-konton…</div>
      ) : accounts.length ? (
        <div className="ac-gmail-list">
          {accounts.map((account) => (
            <div className="ac-gmail-row" key={account.id}>
              <span className="ac-gmail-row-icon"><Icon.Mail size={18} /></span>
              <span className="ac-gmail-row-info">
                <strong>{account.email}</strong>
                <small>
                  {account.status === "active"
                    ? account.lastUsedAt ? `Senast använd ${formatDateTime(account.lastUsedAt)}` : "Ansluten"
                    : "Behöver anslutas igen"}
                </small>
              </span>
              {account.status !== "active" && (
                <button
                  aria-label={`Anslut ${account.email} igen`}
                  className="ac-gmail-reconnect"
                  onClick={() => openForm(account.email)}
                  type="button"
                >
                  <Icon.Refresh size={16} />
                </button>
              )}
              <button
                aria-label={`Koppla bort ${account.email}`}
                className="is-danger"
                disabled={busyId === account.id}
                onClick={() => void disconnect(account)}
                type="button"
              >
                {busyId === account.id ? <span className="ac-button-spinner" /> : <Icon.Trash size={16} />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Icon.Mail />}
          title="Ingen inkorg är ansluten"
          description="Anslut båda dina Gmail-konton så kan AI-agenten leta kvitton åt dig."
        />
      )}
    </section>
  );
}

function AccountsManager({ api, onExpired }: { api: AccountingApi; onExpired: () => void }) {
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ account: "", name: "", category: "" });
  const [editing, setEditing] = useState<AccountingAccount | null>(null);
  const [editValues, setEditValues] = useState({ account: "", name: "", category: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAccounts(await api.accounts());
    } catch (loadError) {
      if (isUnauthorized(loadError)) onExpired();
      else setError(displayError(loadError, "Kontoplanen kunde inte hämtas."));
    } finally {
      setLoading(false);
    }
  }, [api, onExpired]);

  useEffect(() => { void load(); }, [load]);

  function startEdit(account: AccountingAccount) {
    setEditing(account);
    setEditValues({ account: String(account.account), name: account.name, category: account.category ?? "" });
    setConfirmDeleteId(null);
    setError("");
  }

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accountNumber = Number(newAccount.account);
    if (!Number.isInteger(accountNumber) || accountNumber < 1000 || accountNumber > 9999 || !newAccount.name.trim()) {
      setError("Ange ett fyrsiffrigt kontonummer och ett kontonamn.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const account = await api.createAccount({ account: accountNumber, name: newAccount.name.trim(), category: newAccount.category.trim() || null });
      setAccounts((current) => [...current, account].sort((left, right) => left.account - right.account));
      setNewAccount({ account: "", name: "", category: "" });
      setAddOpen(false);
    } catch (saveError) {
      if (isUnauthorized(saveError)) onExpired();
      else setError(displayError(saveError, "Kontot kunde inte skapas."));
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const accountNumber = Number(editValues.account);
    if (!Number.isInteger(accountNumber) || accountNumber < 1000 || accountNumber > 9999 || !editValues.name.trim()) {
      setError("Ange ett fyrsiffrigt kontonummer och ett kontonamn.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const account = await api.updateAccount(editing.id, {
        account: accountNumber,
        name: editValues.name.trim(),
        category: editValues.category.trim() || null,
        version: editing.version,
      });
      setAccounts((current) => current.map((item) => item.id === account.id ? account : item).sort((left, right) => left.account - right.account));
      setEditing(null);
    } catch (saveError) {
      if (isUnauthorized(saveError)) onExpired();
      else setError(displayError(saveError, "Kontot kunde inte uppdateras."));
    } finally {
      setSaving(false);
    }
  }

  async function removeAccount(account: AccountingAccount) {
    setSaving(true);
    setError("");
    try {
      await api.deleteAccount(account.id, account.version);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setConfirmDeleteId(null);
    } catch (deleteError) {
      if (isUnauthorized(deleteError)) onExpired();
      else setError(displayError(deleteError, "Kontot kunde inte tas bort."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ac-card ac-accounts-card" aria-labelledby="accounts-heading">
      <div className="ac-section-heading-row">
        <div><p className="ac-eyebrow">Inställningar</p><h2 id="accounts-heading">Kontoplan</h2></div>
        <button className="ac-mini-add-button" onClick={() => { setAddOpen((open) => !open); setEditing(null); }} type="button">
          {addOpen ? <Icon.Close size={17} /> : <Icon.Plus size={17} />} {addOpen ? "Stäng" : "Nytt konto"}
        </button>
      </div>
      <p className="ac-account-intro">Hantera BAS-konton som används av AI-förslag och manuell bokföring.</p>

      {addOpen && (
        <form className="ac-account-form" onSubmit={(event) => void addAccount(event)}>
          <label className="ac-field"><span>Kontonummer</span><input inputMode="numeric" maxLength={4} placeholder="6540" value={newAccount.account} onChange={(event) => setNewAccount((current) => ({ ...current, account: event.target.value.replace(/\D/g, "") }))} /></label>
          <label className="ac-field"><span>Namn</span><input placeholder="IT-tjänster" value={newAccount.name} onChange={(event) => setNewAccount((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="ac-field"><span>Kategori</span><input placeholder="Övriga externa kostnader" value={newAccount.category} onChange={(event) => setNewAccount((current) => ({ ...current, category: event.target.value }))} /></label>
          <button className="ac-button ac-button--primary" disabled={saving} type="submit"><Icon.Check size={18} /> Lägg till konto</button>
        </form>
      )}

      {error && <p className="ac-settings-error" role="alert"><Icon.Alert size={16} /> {error}</p>}

      {loading ? (
        <div className="ac-history-loading"><span className="ac-loader" /> Hämtar kontoplan…</div>
      ) : accounts.length ? (
        <div className="ac-account-list">
          {accounts.map((account) => editing?.id === account.id ? (
            <form className="ac-account-edit-row" key={account.id} onSubmit={(event) => void saveEdit(event)}>
              <input aria-label="Kontonummer" inputMode="numeric" maxLength={4} value={editValues.account} onChange={(event) => setEditValues((current) => ({ ...current, account: event.target.value.replace(/\D/g, "") }))} />
              <input aria-label="Kontonamn" value={editValues.name} onChange={(event) => setEditValues((current) => ({ ...current, name: event.target.value }))} />
              <input aria-label="Kategori" placeholder="Kategori" value={editValues.category} onChange={(event) => setEditValues((current) => ({ ...current, category: event.target.value }))} />
              <div><button disabled={saving} type="submit"><Icon.Check size={17} /> Spara</button><button disabled={saving} onClick={() => setEditing(null)} type="button">Avbryt</button></div>
            </form>
          ) : (
            <div className="ac-account-row" key={account.id}>
              <strong>{account.account}</strong>
              <span><strong>{account.name}</strong><small>{account.category || "Ingen kategori"}</small></span>
              <button aria-label={`Redigera konto ${account.account}`} onClick={() => startEdit(account)} type="button"><Icon.Edit size={17} /></button>
              <button aria-label={`Ta bort konto ${account.account}`} className="is-danger" onClick={() => setConfirmDeleteId(account.id)} type="button"><Icon.Trash size={17} /></button>
              {confirmDeleteId === account.id && (
                <div className="ac-account-delete-confirm" role="alert">
                  <span>Ta bort {account.account} {account.name}?</span>
                  <button disabled={saving} onClick={() => void removeAccount(account)} type="button">Ja, ta bort</button>
                  <button disabled={saving} onClick={() => setConfirmDeleteId(null)} type="button">Avbryt</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Icon.Receipt />} title="Kontoplanen är tom" description="Lägg till det första kontot för bättre AI-förslag." />
      )}
    </section>
  );
}



function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="ac-error-state" role="alert">
      <span><Icon.Alert /></span>
      <div><strong>Kunde inte hämta data</strong><p>{message}</p></div>
      <button className="ac-button ac-button--secondary" onClick={onRetry} type="button"><Icon.Refresh size={18} /> Försök igen</button>
    </div>
  );
}
