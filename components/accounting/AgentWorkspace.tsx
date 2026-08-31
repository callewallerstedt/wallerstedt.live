"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react";

import { AccountingApi, AccountingApiError } from "./api";
import type { AccountingDocument, AccountingEntry } from "./types";

type Balance = {
  account: number;
  name: string | null;
  balance: number;
  exact: string;
  entryCount: number;
};

type AgentPayload = {
  ok?: boolean;
  message?: string;
  accounts?: Balance[];
  documents?: AccountingDocument[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Något gick fel.";
}

function currency(value: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: 2,
  }).format(value);
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function AgentWorkspace({ accessKey }: { accessKey: string }) {
  const api = useMemo(() => new AccountingApi(accessKey), [accessKey]);
  const base = `/api/accounting/${encodeURIComponent(accessKey)}/agent/v1`;
  const fileInput = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<"checking" | "signed-out" | "signed-in" | "error">("checking");
  const [password, setPassword] = useState("");
  const [balances, setBalances] = useState<Balance[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [entryId, setEntryId] = useState("");
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [uploaded, setUploaded] = useState<AccountingDocument[]>([]);

  const agentRequest = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    let payload: AgentPayload = {};
    try { payload = await response.json() as AgentPayload; } catch { payload = {}; }
    if (!response.ok) {
      throw new AccountingApiError(payload.message || `HTTP ${response.status}`, response.status);
    }
    return payload;
  }, [base]);

  const refresh = useCallback(async () => {
    const [balancePayload, entryPayload] = await Promise.all([
      agentRequest("/balances?accounts=1930,2893,1385"),
      api.entries("limit=40"),
    ]);
    setBalances(balancePayload.accounts ?? []);
    setEntries(entryPayload.entries.slice(0, 40));
  }, [agentRequest, api]);

  useEffect(() => {
    let active = true;
    void api.session()
      .then(async (authenticated) => {
        if (!active) return;
        if (!authenticated) {
          setSession("signed-out");
          return;
        }
        setSession("signed-in");
        await refresh();
      })
      .catch(() => { if (active) setSession("error"); });
    return () => { active = false; };
  }, [api, refresh]);

  function appendFiles(next: File[]) {
    setFiles((current) => {
      const known = new Set(current.map(fileKey));
      return [...current, ...next.filter((file) => file.size > 0 && !known.has(fileKey(file)))].slice(0, 8);
    });
  }

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    const next = Array.from(event.clipboardData.files);
    if (next.length) {
      event.preventDefault();
      appendFiles(next);
    }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    appendFiles(Array.from(event.dataTransfer.files));
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!(await api.login(password))) throw new Error("Inloggningen kunde inte bekräftas.");
      setPassword("");
      setSession("signed-in");
      await refresh();
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setBusy(false);
    }
  }

  async function attach(event: FormEvent) {
    event.preventDefault();
    if (!files.length && !url.trim()) {
      setError("Lägg till en fil eller URL.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Laddar upp…");
    setUploaded([]);
    const target = entryId.trim() || null;
    try {
      const documents: AccountingDocument[] = [];
      if (files.length) {
        documents.push(...await api.uploadDocuments(files, (progress) => {
          setStatus(`${progress.fileIndex + 1}/${progress.fileCount} · ${progress.overallPercentage} %`);
        }, target));
      }
      if (url.trim()) {
        const payload = await agentRequest("/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), entryId: target }),
        });
        documents.push(...(payload.documents ?? []));
      }
      setUploaded(documents);
      setFiles([]);
      setUrl("");
      if (fileInput.current) fileInput.current.value = "";
      setStatus(`${documents.length} ${documents.length === 1 ? "underlag klart" : "underlag klara"}`);
      await refresh();
    } catch (attachError) {
      if (attachError instanceof AccountingApiError && attachError.status === 401) setSession("signed-out");
      setError(errorMessage(attachError));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  if (session === "checking") return <main className="agent-gate"><span className="agent-spinner" /></main>;

  if (session === "error") {
    return <main className="agent-gate"><button onClick={() => window.location.reload()} type="button">Försök igen</button></main>;
  }

  if (session === "signed-out") {
    return (
      <main className="agent-gate">
        <form className="agent-login" onSubmit={signIn}>
          <span className="agent-mark">A</span>
          <h1>Agent vault</h1>
          <input
            autoComplete="current-password"
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Lösenord"
            type="password"
            value={password}
          />
          {error && <p role="alert">{error}</p>}
          <button disabled={busy || !password} type="submit">Öppna</button>
        </form>
      </main>
    );
  }

  return (
    <main className="agent-shell" onPaste={onPaste}>
      <header className="agent-header">
        <div><span className="agent-mark">A</span><h1>Agent vault</h1></div>
        <a href={`${base}/schema`}>JSON schema</a>
      </header>

      <section className="agent-balances" aria-label="Kontosaldon">
        {balances.map((balance) => (
          <article key={balance.account} data-account={balance.account}>
            <span>{balance.account}</span>
            <strong>{currency(balance.balance)}</strong>
            <small>{balance.name || `${balance.entryCount} poster`}</small>
          </article>
        ))}
      </section>

      <section className="agent-grid">
        <form className="agent-attach-card" onSubmit={attach}>
          <div className="agent-section-title"><span>01</span><h2>Underlag</h2></div>
          <label className="agent-target">
            <span>Verifikation ID</span>
            <input
              data-agent-entry-id
              list="agent-entry-ids"
              onChange={(event) => setEntryId(event.target.value)}
              placeholder="Valfritt"
              value={entryId}
            />
          </label>
          <datalist id="agent-entry-ids">
            {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.date} · {entry.description}</option>)}
          </datalist>

          <label
            className={`agent-file-zone ${dragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            <span>Filer</span>
            <input
              accept="image/jpeg,image/png,.pdf,.txt,.csv"
              data-agent-file-input
              multiple
              onChange={(event) => appendFiles(Array.from(event.target.files ?? []))}
              ref={fileInput}
              type="file"
            />
            <small>Välj · släpp · klistra in</small>
          </label>

          {files.length > 0 && (
            <ul className="agent-file-list">
              {files.map((file) => (
                <li key={fileKey(file)}><span>{file.name}</span><button aria-label={`Ta bort ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => fileKey(item) !== fileKey(file)))} type="button">×</button></li>
              ))}
            </ul>
          )}

          <label className="agent-url">
            <span>URL</span>
            <input
              data-agent-url-input
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              type="url"
              value={url}
            />
          </label>

          {error && <p className="agent-error" role="alert">{error}</p>}
          {uploaded.length > 0 && (
            <ul className="agent-uploaded" data-agent-upload-result>
              {uploaded.map((document) => <li key={document.id}>{document.originalName || document.name}<code>{document.id}</code></li>)}
            </ul>
          )}
          <button className="agent-submit" disabled={busy || (!files.length && !url.trim())} type="submit">
            {busy ? status : "Lägg till underlag"}
          </button>
          {!busy && status && <p className="agent-status" role="status">{status}</p>}
        </form>

        <section className="agent-posts">
          <div className="agent-section-title"><span>02</span><h2>Senaste poster</h2></div>
          <div className="agent-post-list">
            {entries.map((entry) => (
              <button
                data-entry-id={entry.id}
                key={entry.id}
                onClick={() => setEntryId(entry.id)}
                type="button"
              >
                <span>{entry.date || "—"}</span>
                <strong>{entry.description}</strong>
                <small>{entry.debitAccount || "—"} → {entry.creditAccount || "—"}</small>
                <b>{currency(entry.amount)}</b>
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
