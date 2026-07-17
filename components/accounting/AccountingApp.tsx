"use client";

import Image from "next/image";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
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
  AccountingRevision,
  AppTab,
  DashboardData,
  DraftEntry,
} from "./types";

type SessionStatus = "checking" | "authenticated" | "unauthenticated" | "error";

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
  const label = entryTypeLabel(entry);
  if (label === "Intäkt") return "income";
  if (label === "Kostnad") return "expense";
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
      version: null,
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
  const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const [draft, setDraft] = useState<AccountingDraft | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState<AccountingUploadProgress | null>(null);
  const [aiError, setAiError] = useState("");
  const [toast, setToast] = useState("");

  const expireSession = useCallback(() => {
    setSessionStatus("unauthenticated");
    setDashboard(null);
    setEntries([]);
    setEntriesLoaded(false);
    setEditingEntry(null);
    setDraft(null);
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
      setSessionError(displayError(error, "Kunde inte kontrollera inloggningen."));
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
    setEntriesLoaded(false);
    setEditingEntry(null);
    setTab("home");
    setToast(message);
    void loadDashboard();
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

  const refreshing = dashboardLoading || entriesLoading || entryLoading;

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
        {draft ? (
          <DraftReview
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
              setEntriesLoaded(false);
              setToast("Ändringarna är sparade.");
              void loadDashboard();
            }}
          />
        ) : tab === "home" ? (
          <HomeView
            dashboard={dashboard}
            error={dashboardError}
            files={aiFiles}
            loading={dashboardLoading}
            onAnalyze={() => void analyzeDraft()}
            onFiles={setAiFiles}
            onManual={startManualDraft}
            onOpenEntry={(entry) => void openEntry(entry)}
            onRetry={() => void loadDashboard()}
            onText={setAiText}
            text={aiText}
            aiError={aiError}
            aiLoading={aiLoading}
            progress={aiProgress}
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
            entries={entries}
            error={entriesError}
            loading={entriesLoading}
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
    { id: "add", label: "Ny post", icon: Icon.Spark },
    { id: "ledger", label: "Poster", icon: Icon.Receipt },
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
              <span className="ac-nav-icon"><ItemIcon size={isAdd ? 24 : 22} /></span>
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

function HomeView({
  dashboard,
  error,
  files,
  loading,
  onAnalyze,
  onFiles,
  onManual,
  onOpenEntry,
  onRetry,
  onText,
  text,
  aiError,
  aiLoading,
  progress,
}: {
  dashboard: DashboardData | null;
  error: string;
  files: File[];
  loading: boolean;
  onAnalyze: () => void;
  onFiles: (files: File[]) => void;
  onManual: () => void;
  onOpenEntry: (entry: AccountingEntry) => void;
  onRetry: () => void;
  onText: (text: string) => void;
  text: string;
  aiError: string;
  aiLoading: boolean;
  progress: AccountingUploadProgress | null;
}) {
  return (
    <div className="ac-view ac-home-view">
      <PageHeading eyebrow="Översikt" title="Hej Calle" description="Allt du behöver för dagens bokföring." />

      <div className="ac-home-grid">
        <div className="ac-home-primary">
          <AiComposer
            aiError={aiError}
            compact
            files={files}
            loading={aiLoading}
            onAnalyze={onAnalyze}
            onFiles={onFiles}
            onManual={onManual}
            onText={onText}
            progress={progress}
            text={text}
          />

          <section className="ac-section-block" aria-labelledby="recent-heading">
            <div className="ac-section-heading-row">
              <div>
                <p className="ac-eyebrow">Senaste</p>
                <h2 id="recent-heading">Nyligen bokfört</h2>
              </div>
              {dashboard && <span className="ac-count-badge">{dashboard.summary.entryCount} poster</span>}
            </div>
            {loading && !dashboard ? (
              <EntryListSkeleton count={3} />
            ) : error && !dashboard ? (
              <ErrorState message={error} onRetry={onRetry} />
            ) : dashboard?.recentEntries.length ? (
              <div className="ac-entry-list">
                {dashboard.recentEntries.slice(0, 6).map((entry) => (
                  <EntryRow entry={entry} key={entry.id} onClick={() => onOpenEntry(entry)} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Icon.Receipt />}
                title="Inga poster ännu"
                description="Din första sparade post kommer att visas här. Börja med AI-rutan ovan."
              />
            )}
          </section>
        </div>

        <aside className="ac-home-sidebar" aria-label="Ekonomisk sammanfattning">
          <SummaryCards dashboard={dashboard} error={error} loading={loading} onRetry={onRetry} />
        </aside>
      </div>
    </div>
  );
}

function SummaryCards({
  dashboard,
  error,
  loading,
  onRetry,
}: {
  dashboard: DashboardData | null;
  error: string;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading && !dashboard) {
    return (
      <div className="ac-summary-grid" aria-label="Laddar sammanfattning">
        <div className="ac-summary-card ac-skeleton-card" />
        <div className="ac-summary-card ac-skeleton-card" />
        <div className="ac-summary-card ac-skeleton-card" />
      </div>
    );
  }
  if (error && !dashboard) return <ErrorState message={error} onRetry={onRetry} />;
  const summary = dashboard?.summary;
  if (!summary) return null;
  const resultPositive = summary.result >= 0;
  return (
    <div className="ac-summary-grid">
      <article className={`ac-summary-card ac-summary-card--result ${resultPositive ? "is-positive" : "is-negative"}`}>
        <div className="ac-summary-card-top">
          <span>Resultat</span>
          <span className="ac-summary-icon"><Icon.Wallet size={20} /></span>
        </div>
        <strong>{formatCurrency(summary.result)}</strong>
        <small>{resultPositive ? "Intäkter minus kostnader" : "Kostnaderna överstiger intäkterna"}</small>
      </article>
      <div className="ac-summary-pair">
        <article className="ac-summary-card">
          <span>Intäkter</span>
          <strong className="ac-text-positive">{formatCurrency(summary.income)}</strong>
        </article>
        <article className="ac-summary-card">
          <span>Kostnader</span>
          <strong>{formatCurrency(summary.expenses)}</strong>
        </article>
      </div>
      <article className="ac-summary-card ac-summary-card--compact">
        <div><span>Moms</span><strong>{formatCurrency(summary.vat)}</strong></div>
        <div><span>Saldo</span><strong>{summary.balance == null ? "Ej beräknat" : formatCurrency(summary.balance)}</strong></div>
      </article>
      <article className="ac-summary-card ac-summary-card--compact">
        <div><span>Poster</span><strong>{numberFormatter.format(summary.entryCount)}</strong></div>
        <div><span>Underlag</span><strong>{numberFormatter.format(summary.receiptCount)}</strong></div>
      </article>
      <div className="ac-backup-mini">
        <span className={`ac-backup-dot ${dashboard?.backup?.status === "error" ? "is-error" : ""}`} />
        <div>
          <strong>{dashboard?.backup?.status === "error" ? "Kontrollera backup" : "Backupstatus"}</strong>
          <span>{formatDateTime(dashboard?.backup?.lastAt)}</span>
        </div>
      </div>
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
        <p className="ac-eyebrow">AI-assistent</p>
        <h2 id={compact ? "quick-ai-heading" : "new-ai-heading"}>{compact ? "Ny post med AI" : "Skapa ett utkast"}</h2>
        <p>{compact ? "Skriv eller lägg till flera kvitton samtidigt." : "AI delar upp materialet i separata, redigerbara bokföringsförslag som du kontrollerar ett i taget."}</p>
      </div>

      <label className="ac-ai-textarea">
        <span className="ac-visually-hidden">Beskriv bokföringsposten</span>
        <textarea
          disabled={loading}
          onChange={(event) => onText(event.target.value)}
          placeholder="T.ex. Adobe Creative Cloud, 742,50 kr inkl. moms, betalt med företagskort…"
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
      </div>

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
                    : "AI analyserar underlaget"}
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
            ? <><span className="ac-button-spinner" /> {progress?.phase === "preparing" ? "Förbereder…" : progress?.phase === "uploading" ? "Laddar upp…" : progress?.phase === "finalizing" ? "Registrerar…" : "AI läser underlaget…"}</>
            : <><Icon.Spark /> Skapa förslag</>}
        </button>
        <button className="ac-text-button" disabled={loading} onClick={onManual} type="button">
          Fyll i manuellt
        </button>
      </div>
      <p className="ac-ai-safety"><Icon.Shield size={16} /> Inget bokförs innan du granskar och godkänner.</p>
    </section>
  );
}

function EntryRow({ entry, onClick }: { entry: AccountingEntry; onClick: () => void }) {
  const tone = entryTone(entry);
  return (
    <button className="ac-entry-row" onClick={onClick} type="button">
      <span className={`ac-entry-avatar is-${tone}`}><Icon.Receipt size={20} /></span>
      <span className="ac-entry-copy">
        <strong>{entry.description || "Bokföringspost"}</strong>
        <small>{formatDate(entry.date)} · {entry.debitAccount || entry.creditAccount || entryTypeLabel(entry)}</small>
      </span>
      <span className="ac-entry-amount">
        <strong className={tone === "income" ? "ac-text-positive" : ""}>{formatCurrency(entry.amount)}</strong>
        <small>{entryTypeLabel(entry)}</small>
      </span>
      <Icon.Chevron className="ac-row-chevron" size={19} />
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
  api,
  draft,
  onCancel,
  onChange,
  onExpired,
  onSaved,
}: {
  api: AccountingApi;
  draft: AccountingDraft;
  onCancel: () => void;
  onChange: (draft: AccountingDraft) => void;
  onExpired: () => void;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
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
      <button className="ac-back-button" disabled={saving} onClick={onCancel} type="button"><Icon.ArrowLeft /> Tillbaka</button>
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
                <button aria-label={`Ta bort post ${index + 1}`} className="ac-icon-button ac-icon-button--danger" onClick={() => removeEntry(index)} type="button"><Icon.Trash size={19} /></button>
              )}
            </div>
            {entry.reasoning && (
              <div className="ac-ai-reasoning">
                <Icon.Spark size={17} />
                <p><strong>AI:s bedömning{entry.confidence != null ? ` · ${Math.round(entry.confidence * 100)} % säkerhet` : ""}</strong>{entry.reasoning}</p>
              </div>
            )}
            <EntryFields entry={entry} onChange={(patch) => updateEntry(index, patch)} />
            {!draft.manual && (
              <label className="ac-entry-review-check">
                <input
                  checked={reviewedEntryKeys.has(entryReviewKey(entry, index))}
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

      <button className="ac-add-row-button" disabled={saving} onClick={addEntry} type="button"><Icon.Plus /> Lägg till ytterligare rad</button>

      {error && <p className="ac-form-error ac-form-error--block" role="alert"><Icon.Alert size={18} /> {error}</p>}

      <div className="ac-review-footer">
        <div>
          <span>Totalt</span>
          <strong>{formatCurrency(draft.entries.reduce((sum, entry) => sum + asNumber(entry.amount), 0))}</strong>
          <small>{draft.entries.length} {draft.entries.length === 1 ? "post" : "poster"}</small>
        </div>
        <button className="ac-button ac-button--primary" disabled={saving} onClick={() => void save()} type="button">
          {saving ? <><span className="ac-button-spinner" /> Sparar säkert…</> : <><Icon.Check /> Godkänn och bokför</>}
        </button>
      </div>
      <p className="ac-review-assurance"><Icon.Shield size={16} /> Först när du trycker på “Godkänn och bokför” skickas godkännandet.</p>
    </div>
  );
}

function EntryFields({ entry, onChange }: { entry: DraftEntry | AccountingEntry; onChange: (patch: Partial<DraftEntry>) => void }) {
  return (
    <div className="ac-entry-fields">
      <label className="ac-field">
        <span>Datum</span>
        <input type="date" value={entry.date || ""} onChange={(event) => onChange({ date: event.target.value })} />
      </label>
      <label className="ac-field ac-field--wide">
        <span>Beskrivning</span>
        <input autoComplete="off" placeholder="Vad gäller posten?" value={entry.description || ""} onChange={(event) => onChange({ description: event.target.value })} />
      </label>
      <label className="ac-field">
        <span>Typ</span>
        <select value={canonicalEntryType(entry.type)} onChange={(event) => onChange({ type: event.target.value })}>
          <option value="Utbetalning">Kostnad (utbetalning)</option>
          <option value="Inbetalning">Intäkt (inbetalning)</option>
          <option value="Överföring">Överföring</option>
          <option value="Skuld">Skuld / övrigt</option>
        </select>
      </label>
      <label className="ac-field">
        <span>Totalbelopp</span>
        <span className="ac-money-input">
          <input inputMode="decimal" min="0" step="0.01" type="number" value={entry.amount ?? 0} onChange={(event) => onChange({ amount: asNumber(event.target.value) })} />
          <span>SEK</span>
        </span>
      </label>
      <label className="ac-field">
        <span>Exkl. moms</span>
        <span className="ac-money-input">
          <input inputMode="decimal" min="0" placeholder="0,00" step="0.01" type="number" value={entry.beloppExMoms ?? ""} onChange={(event) => onChange({ beloppExMoms: event.target.value === "" ? null : asNumber(event.target.value) })} />
          <span>SEK</span>
        </span>
      </label>
      <label className="ac-field">
        <span>Moms</span>
        <span className="ac-money-input">
          <input inputMode="decimal" min="0" placeholder="0,00" step="0.01" type="number" value={entry.moms ?? ""} onChange={(event) => onChange({ moms: event.target.value === "" ? null : asNumber(event.target.value) })} />
          <span>SEK</span>
        </span>
      </label>
      <fieldset className="ac-account-group ac-field--wide">
        <legend>Debet</legend>
        <label className="ac-field">
          <span>Konto</span>
          <input inputMode="numeric" placeholder="T.ex. 6540" value={entry.debitAccount || ""} onChange={(event) => onChange({ debitAccount: event.target.value })} />
        </label>
        <label className="ac-field">
          <span>Kontonamn</span>
          <input placeholder="T.ex. IT-tjänster" value={entry.debitName || ""} onChange={(event) => onChange({ debitName: event.target.value })} />
        </label>
      </fieldset>
      <fieldset className="ac-account-group ac-field--wide">
        <legend>Kredit</legend>
        <label className="ac-field">
          <span>Konto</span>
          <input inputMode="numeric" placeholder="T.ex. 1930" value={entry.creditAccount || ""} onChange={(event) => onChange({ creditAccount: event.target.value })} />
        </label>
        <label className="ac-field">
          <span>Kontonamn</span>
          <input placeholder="T.ex. Företagskonto" value={entry.creditName || ""} onChange={(event) => onChange({ creditName: event.target.value })} />
        </label>
      </fieldset>
      <label className="ac-field">
        <span>Momskonto</span>
        <input inputMode="numeric" placeholder="T.ex. 2641" value={entry.momsAccount || ""} onChange={(event) => onChange({ momsAccount: event.target.value })} />
      </label>
      <label className="ac-field ac-field--wide">
        <span>Anteckning</span>
        <textarea placeholder="Valfri intern anteckning" rows={3} value={entry.notes || ""} onChange={(event) => onChange({ notes: event.target.value })} />
      </label>
    </div>
  );
}

function LedgerView({
  entries,
  error,
  loading,
  onOpenEntry,
  onRetry,
}: {
  entries: AccountingEntry[];
  error: string;
  loading: boolean;
  onOpenEntry: (entry: AccountingEntry) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [year, setYear] = useState("all");

  const years = useMemo(() => Array.from(new Set(entries.map((entry) => entry.date.slice(0, 4)).filter(Boolean))).sort().reverse(), [entries]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("sv-SE");
    return entries
      .filter((entry) => {
        if (year !== "all" && !entry.date.startsWith(year)) return false;
        if (type !== "all" && entryTone(entry) !== type) return false;
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
  }, [entries, query, type, year]);

  return (
    <div className="ac-view ac-ledger-view">
      <PageHeading eyebrow="Huvudbok" title="Alla poster" description="Sök, kontrollera och uppdatera dina importerade och nya verifikationer." />
      <section className="ac-card ac-ledger-card">
        <div className="ac-ledger-toolbar">
          <label className="ac-search-field">
            <span className="ac-visually-hidden">Sök poster</span>
            <Icon.Search size={20} />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Sök företag, belopp eller konto" type="search" value={query} />
            {query && <button aria-label="Rensa sökning" onClick={() => setQuery("")} type="button"><Icon.Close size={17} /></button>}
          </label>
          <div className="ac-filter-row">
            <label>
              <span className="ac-visually-hidden">Filtrera typ</span>
              <select onChange={(event) => setType(event.target.value)} value={type}>
                <option value="all">Alla typer</option>
                <option value="income">Intäkter</option>
                <option value="expense">Kostnader</option>
                <option value="neutral">Övrigt</option>
              </select>
            </label>
            <label>
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
          {(query || type !== "all" || year !== "all") && <button onClick={() => { setQuery(""); setType("all"); setYear("all"); }} type="button">Rensa filter</button>}
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
            icon={<Icon.Search />}
            title={entries.length ? "Inga träffar" : "Inga bokföringsposter"}
            description={entries.length ? "Prova ett annat sökord eller rensa filtren." : "Importerade och nya poster visas här när de finns."}
          />
        )}
      </section>
    </div>
  );
}

function EntryEditor({
  accessKey,
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

  async function addDocuments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
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
          <EntryFields entry={entry} onChange={patchEntry} />
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
              <div><p className="ac-eyebrow">Underlag</p><h2 id="documents-heading">Dokument</h2></div>
              <div className="ac-document-actions">
                <span className="ac-count-badge">{entry.documents.length}</span>
                <input
                  accept="image/jpeg,image/png,.pdf,.txt,.csv"
                  className="ac-visually-hidden"
                  multiple
                  onChange={(event) => void addDocuments(event)}
                  ref={documentInputRef}
                  type="file"
                />
                <button
                  aria-label="Lägg till underlag"
                  className="ac-mini-add-button"
                  disabled={uploadingDocuments}
                  onClick={() => documentInputRef.current?.click()}
                  type="button"
                >
                  <Icon.Plus size={17} /> Lägg till
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
            {entry.documents.length ? (
              <ul className="ac-document-list">
                {entry.documents.map((document, index) => {
                  const suppliedUrl = document.downloadUrl || document.url;
                  const fallbackUrl = document.id
                    ? `/api/accounting/${encodeURIComponent(accessKey)}/documents/${encodeURIComponent(document.id)}/download`
                    : "";
                  const url = suppliedUrl
                    ? suppliedUrl.startsWith("http://") || suppliedUrl.startsWith("https://") || suppliedUrl.startsWith("/")
                      ? suppliedUrl
                      : `/api/accounting/${encodeURIComponent(accessKey)}/${suppliedUrl.replace(/^\/+/, "")}`
                    : fallbackUrl;
                  return (
                    <li key={document.id || `${documentName(document, index)}-${index}`}>
                      <span><Icon.File size={20} /></span>
                      <span><strong>{documentName(document, index)}</strong><small>{document.contentType || document.mimeType || "Underlag"}</small></span>
                      {url && <a aria-label={`Öppna ${documentName(document, index)}`} href={url} target="_blank" rel="noopener noreferrer"><Icon.Download size={19} /></a>}
                      {document.id && document.version != null && (
                        <button
                          aria-label={`Ta bort ${documentName(document, index)}`}
                          className="ac-document-delete-button"
                          disabled={deletingDocumentId === document.id}
                          onClick={() => setConfirmDocumentId(document.id!)}
                          type="button"
                        >
                          <Icon.Trash size={17} />
                        </button>
                      )}
                      {confirmDocumentId === document.id && (
                        <div className="ac-document-delete-confirm" role="alert">
                          <span>Ta bort detta underlag?</span>
                          <button disabled={deletingDocumentId === document.id} onClick={() => void deleteDocument(document)} type="button">Ja, ta bort</button>
                          <button disabled={deletingDocumentId === document.id} onClick={() => setConfirmDocumentId(null)} type="button">Avbryt</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ac-muted-copy">Inget dokument är kopplat till posten.</p>
            )}
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
