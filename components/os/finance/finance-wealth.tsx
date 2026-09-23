"use client";

import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { BalanceLine, SavingsChart } from "@/components/os/finance/finance-charts";
import {
  categoryMeta,
  kr,
  maskIban,
  monthLabel,
  relativeTime,
  type FinanceApi,
  type FinanceSummary,
} from "@/components/os/finance/shared";
import { EmptyState, Panel, SectionLabel } from "@/components/os/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ASSET_KINDS: Array<{ id: string; label: string; emoji: string }> = [
  { id: "investment", label: "Investments", emoji: "📈" },
  { id: "savings", label: "Savings", emoji: "🏦" },
  { id: "crypto", label: "Crypto", emoji: "🪙" },
  { id: "vehicle", label: "Vehicle", emoji: "🚗" },
  { id: "property", label: "Property", emoji: "🏠" },
  { id: "debt", label: "Loan / debt", emoji: "💳" },
  { id: "other", label: "Other", emoji: "📦" },
];

const kindMeta = (id: string) => ASSET_KINDS.find((kind) => kind.id === id) ?? ASSET_KINDS[ASSET_KINDS.length - 1]!;

const inputClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function FinanceWealth({
  summary,
  api,
  onChanged,
  onConnect,
}: {
  summary: FinanceSummary;
  api: FinanceApi;
  onChanged: () => Promise<unknown>;
  onConnect: (bank?: string, country?: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const netWorthPoints =
    summary.netWorthHistory.length >= 3
      ? summary.netWorthHistory.map((row) => ({ date: row.date, cents: row.totalCents }))
      : summary.balanceHistory.map((row) => ({ date: row.date, cents: row.cents + summary.totals.assetsCents }));

  // Whole months only: the first one with data and the running one are partial.
  const savingsMonths = summary.history.filter(
    (row) => row.hasData && row.month > summary.firstDataMonth && row.month < summary.today.slice(0, 7),
  );

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  return (
    <>
      <section className="grid grid-cols-3 gap-2">
        <Tile label="Net worth" value={kr(summary.totals.netWorthCents)} strong />
        <Tile label="Bank" value={kr(summary.totals.bankCents)} />
        <Tile label="Investments & other" value={kr(summary.totals.assetsCents)} />
      </section>
      <section className="grid grid-cols-2 gap-2">
        <Tile
          label="🏢 Company owes you"
          value={kr(summary.totals.companyOwesYouCents)}
          hint={`${summary.company.count} utlägg tagged Företagsutlägg. Tag the repayment the same way and it drops.`}
        />
        <Tile
          label="🤝 You owe (family loans)"
          value={kr(summary.totals.youOweCents)}
          hint={`${summary.loans.count} loan transactions. Money in from the loan and repayments out, both tagged Loans.`}
        />
      </section>

      {error ? <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm ring-1 ring-destructive/30">{error}</p> : null}

      {netWorthPoints.length > 2 ? (
        <Panel
          title="Net worth"
          footer={
            summary.netWorthHistory.length >= 3
              ? "Recorded at every sync."
              : "Rebuilt from today's balances and your transaction history; fills in as syncs run."
          }
        >
          <div className="px-1">
            <BalanceLine points={netWorthPoints} label="Net worth over time" />
          </div>
        </Panel>
      ) : null}

      {savingsMonths.length > 1 ? (
        <Panel
          title="Money kept over time"
          action={
            <span className="text-xs font-semibold tabular-nums text-positive">
              {kr(savingsMonths.reduce((sum, row) => sum + row.netCents, 0))} in {savingsMonths.length} months
            </span>
          }
          footer="Finished months. Bars: income minus spending each month. Line: the running total. Money moved to Avanza or savings counts as kept, not spent."
        >
          <div className="px-1">
            <SavingsChart months={savingsMonths} labels={savingsMonths.map((row) => monthLabel(row.month, "short"))} />
          </div>
        </Panel>
      ) : null}

      <SectionLabel>Bank accounts</SectionLabel>
      <Panel footer={<ImportHistory api={api} onDone={onChanged} />}>
        {summary.accounts.length ? (
          summary.accounts.map((account) => (
            <AccountRow key={account.id} account={account} api={api} onChanged={onChanged} onError={setError} />
          ))
        ) : (
          <EmptyState title="No accounts yet" detail="Connect a bank to see balances here." />
        )}
      </Panel>

      <SectionLabel>Investments, Avanza & other holdings</SectionLabel>
      <Assets summary={summary} api={api} run={run} />

      <SectionLabel>Connected banks</SectionLabel>
      <Banks summary={summary} api={api} run={run} onConnect={onConnect} />

      <Rules api={api} run={run} />
    </>
  );
}

function Tile({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10", strong && "ring-brand/40")}>
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate font-semibold tabular-nums tracking-tight", strong ? "text-xl sm:text-2xl" : "text-base sm:text-xl")}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[0.68rem] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AccountRow({
  account,
  api,
  onChanged,
  onError,
}: {
  account: FinanceSummary["accounts"][number];
  api: FinanceApi;
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.displayName || account.name);
  const [busy, setBusy] = useState(false);

  async function patch(body: { displayName?: string; hidden?: boolean }) {
    setBusy(true);
    onError(null);
    try {
      await api.send("PATCH", `/accounts/${encodeURIComponent(account.id)}`, body);
      setEditing(false);
      await onChanged();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not update the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("border-t border-border px-3 py-2 first:border-t-0", account.hidden && "opacity-55")}>
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm">🏦</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[account.bank, maskIban(account.iban), account.product && account.product !== account.name ? account.product : ""]
              .filter(Boolean)
              .join(" · ")}
            {account.lastError ? <span className="text-destructive"> · sync error</span> : ` · ${relativeTime(account.balanceAt)}`}
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums">{kr(account.balanceCents)}</p>
        <Button aria-label="Rename" onClick={() => setEditing((value) => !value)} size="icon-sm" variant="ghost">
          <PencilIcon />
        </Button>
        <Button
          aria-label={account.hidden ? "Count this account" : "Leave this account out"}
          disabled={busy}
          onClick={() => void patch({ hidden: !account.hidden })}
          size="icon-sm"
          title={account.hidden ? "Hidden from totals and stats" : "Hide from totals and stats"}
          variant="ghost"
        >
          {account.hidden ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      </div>
      {editing ? (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void patch({ displayName: name });
          }}
        >
          <input autoFocus className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Lönekonto, Sparkonto, Bil" />
          <Button disabled={busy} size="lg" type="submit" variant="brand">
            Save
          </Button>
        </form>
      ) : null}
      {account.lastError ? <p className="mt-1 text-xs text-destructive">{account.lastError}</p> : null}
    </div>
  );
}

function Assets({
  summary,
  api,
  run,
}: {
  summary: FinanceSummary;
  api: FinanceApi;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "Avanza ISK", kind: "investment", value: "" });
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const toSek = (input: string) => Number(input.replace(/\s/g, "").replace(",", "."));

  return (
    <Panel
      action={
        <Button onClick={() => setAdding((current) => !current)} size="xs" variant="outline">
          <PlusIcon /> Add
        </Button>
      }
      title="Holdings"
      footer="Avanza has no open API for private customers, so holdings are kept here. Update the value whenever you like, or let Grokbot do it through the API."
    >
      {adding ? (
        <form
          className="flex flex-col gap-2 border-b border-border px-3 pb-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void run(() =>
              api.send("POST", "/assets", { name: form.name, kind: form.kind, valueSek: toSek(form.value) || 0 }),
            ).finally(() => {
              setBusy(false);
              setAdding(false);
              setForm({ name: "", kind: "investment", value: "" });
            });
          }}
        >
          <input className={inputClass} placeholder="Name, e.g. Avanza ISK" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <select className={cn(inputClass, "sm:w-40")} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
            {ASSET_KINDS.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.emoji} {kind.label}
              </option>
            ))}
          </select>
          <input className={cn(inputClass, "sm:w-36")} inputMode="decimal" placeholder="Value, kr" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
          <Button disabled={busy || !form.name.trim()} size="lg" type="submit" variant="brand">
            Add
          </Button>
        </form>
      ) : null}
      {summary.assets.length ? (
        summary.assets.map((asset) => (
          <div key={asset.id} className="border-t border-border px-3 py-2 first:border-t-0">
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-base">{kindMeta(asset.kind).emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{asset.name}</p>
                <p className="text-xs text-muted-foreground">
                  {kindMeta(asset.kind).label} · updated {relativeTime(asset.updatedAt)}
                </p>
              </div>
              <p className={cn("text-sm font-semibold tabular-nums", asset.valueCents < 0 && "text-destructive")}>{kr(asset.valueCents)}</p>
              <Button
                aria-label="Update value"
                onClick={() => {
                  setEditing(editing === asset.id ? null : asset.id);
                  setValue(String(Math.round(Math.abs(asset.valueCents) / 100)));
                }}
                size="icon-sm"
                variant="ghost"
              >
                <PencilIcon />
              </Button>
              <Button
                aria-label="Delete"
                onClick={() => {
                  if (window.confirm(`Remove ${asset.name}?`)) void run(() => api.send("DELETE", `/assets/${asset.id}`));
                }}
                size="icon-sm"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </div>
            {editing === asset.id ? (
              <form
                className="mt-2 flex gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  setBusy(true);
                  void run(() => api.send("PATCH", `/assets/${asset.id}`, { valueSek: toSek(value) || 0 })).finally(() => {
                    setBusy(false);
                    setEditing(null);
                  });
                }}
              >
                <input autoFocus className={inputClass} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Current value in kr" />
                <Button disabled={busy} size="lg" type="submit" variant="brand">
                  Save
                </Button>
              </form>
            ) : null}
          </div>
        ))
      ) : !adding ? (
        <EmptyState title="No holdings yet" detail="Add your Avanza ISK, crypto or a car loan to see your whole net worth." />
      ) : null}
    </Panel>
  );
}

function Banks({
  summary,
  api,
  run,
  onConnect,
}: {
  summary: FinanceSummary;
  api: FinanceApi;
  run: (action: () => Promise<unknown>) => Promise<void>;
  onConnect: (bank?: string, country?: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [banks, setBanks] = useState<Array<{ name: string; country: string }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!picking || banks) return;
    setLoading(true);
    api
      .get<{ available?: Array<{ name: string; country: string }> }>("/connect?banks=1")
      .then((data) => setBanks(data.available ?? []))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not list banks."))
      .finally(() => setLoading(false));
  }, [api, banks, picking]);

  const avanza = banks?.find((bank) => /avanza/i.test(bank.name));
  const shown = (banks ?? []).filter((bank) => bank.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 40);

  return (
    <Panel
      action={
        <Button onClick={() => setPicking((value) => !value)} size="xs" variant="outline">
          <PlusIcon /> Add bank
        </Button>
      }
      title="Bank connections"
      footer="Read-only PSD2 access through Enable Banking. Each consent lasts up to 180 days; reconnect with BankID when it runs out. New banks must also be linked in the Enable Banking control panel while the app is in restricted mode."
    >
      {summary.connection.banks.length ? (
        summary.connection.banks.map((bank) => (
          <div key={bank.id} className="flex items-center gap-3 border-t border-border px-3 py-2 first:border-t-0">
            <span className={cn("size-2.5 shrink-0 rounded-full", bank.status === "active" ? "bg-positive" : "bg-destructive")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{bank.bank}</p>
              <p className="text-xs text-muted-foreground">
                {bank.status === "active"
                  ? `Active · ${bank.daysLeft ?? "?"} days left${bank.validUntil ? ` (until ${bank.validUntil.slice(0, 10)})` : ""}`
                  : "Expired: reconnect to resume syncing"}
              </p>
            </div>
            <Button onClick={() => onConnect(bank.bank, bank.country)} size="xs" variant={bank.status === "active" ? "ghost" : "brand"}>
              {bank.status === "active" ? "Renew" : "Reconnect"}
            </Button>
            <Button
              aria-label="Disconnect"
              onClick={() => {
                if (window.confirm(`Disconnect ${bank.bank}? Past transactions are kept.`)) {
                  void run(() => api.send("DELETE", "/connect", { sessionId: bank.id }));
                }
              }}
              size="icon-sm"
              variant="ghost"
            >
              <Trash2Icon />
            </Button>
          </div>
        ))
      ) : (
        <div className="px-3 py-3">
          <Button onClick={() => onConnect()} variant="brand">
            Connect Handelsbanken
          </Button>
        </div>
      )}
      {picking ? (
        <div className="border-t border-border px-3 py-3">
          {loading ? (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          ) : error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <>
              {avanza ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-brand-soft/50 p-2">
                  <p className="flex-1 text-sm">Avanza is available through Open Banking.</p>
                  <Button onClick={() => onConnect(avanza.name, avanza.country)} size="sm" variant="brand">
                    Connect Avanza
                  </Button>
                </div>
              ) : banks ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  Avanza is not in the Open Banking list, so add it under Holdings instead.
                </p>
              ) : null}
              <input className={inputClass} placeholder="Find a bank" value={filter} onChange={(event) => setFilter(event.target.value)} />
              <div className="mt-2 flex max-h-64 flex-col overflow-y-auto">
                {shown.map((bank) => (
                  <button
                    key={`${bank.country}-${bank.name}`}
                    className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => onConnect(bank.name, bank.country)}
                    type="button"
                  >
                    {bank.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

function Rules({ api, run }: { api: FinanceApi; run: (action: () => Promise<unknown>) => Promise<void> }) {
  const [rules, setRules] = useState<Array<{ merchant: string; category: string }> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .get<{ rules: Array<{ merchant: string; category: string }> }>("/rules")
      .then((data) => setRules(data.rules))
      .catch(() => setRules([]));
  }, [api, open]);

  return (
    <details className="rounded-xl bg-card ring-1 ring-foreground/10" onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">Category rules you&apos;ve made</summary>
      {rules == null ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground">Loading…</p>
      ) : rules.length ? (
        rules.map((rule) => (
          <div key={rule.merchant} className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{rule.merchant}</span>
            <span className="text-xs text-muted-foreground">
              {categoryMeta(rule.category).emoji} {categoryMeta(rule.category).label}
            </span>
            <Button
              aria-label="Forget rule"
              onClick={() =>
                void run(() => api.send("DELETE", `/rules?merchant=${encodeURIComponent(rule.merchant)}`)).then(() =>
                  setRules((current) => current?.filter((item) => item.merchant !== rule.merchant) ?? null),
                )
              }
              size="icon-xs"
              variant="ghost"
            >
              <Trash2Icon />
            </Button>
          </div>
        ))
      ) : (
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          None yet. Change a transaction&apos;s category in Activity and tick “always use this” to make one.
        </p>
      )}
    </details>
  );
}

/**
 * The bank API only reaches back about 90 days outside a fresh BankID login.
 * Handelsbanken's own Excel export goes back years; this fills the gap.
 */
function ImportHistory({ api, onDone }: { api: FinanceApi; onDone: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessages([]);
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const { parseHandelsbankenStatement } = await import("@/lib/finance/import");
    const results: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const sheets = await readXlsxFile(file);
        const parsed = parseHandelsbankenStatement(sheets[0]!.data as unknown[][]);
        const result = await api.send<{ account: string; imported: number; alreadyThere: number; skippedOverlap: number; from: string | null; to: string | null }>(
          "POST",
          "/import",
          { accountNumber: parsed.accountNumber, accountName: parsed.accountName, rows: parsed.rows.map(({ date, text, amountCents }) => ({ date, text, amountCents })) },
        );
        results.push(
          `${result.account}: ${result.imported} added${result.from ? ` (${result.from} → ${result.to})` : ""}${
            result.alreadyThere ? `, ${result.alreadyThere} already there` : ""
          }${result.skippedOverlap ? `, ${result.skippedOverlap} newer ones already come from the bank` : ""}.`,
        );
      } catch (caught) {
        results.push(`${file.name}: ${caught instanceof Error ? caught.message : "could not import"}`);
      }
    }
    setMessages(results);
    setBusy(false);
    await onDone();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p>
        Need older history? In Handelsbanken online go to the account → <b>Exportera</b> (Excel), then import it here.
        Only days before the bank connection&apos;s history are added, so nothing is counted twice.
      </p>
      <label className={cn("inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground ring-1 ring-foreground/15 hover:bg-muted", busy && "pointer-events-none opacity-60")}>
        {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />}
        {busy ? "Importing…" : "Import Excel export"}
        <input
          accept=".xlsx"
          className="sr-only"
          disabled={busy}
          multiple
          onChange={(event) => {
            void importFiles(event.target.files);
            event.target.value = "";
          }}
          type="file"
        />
      </label>
      {messages.map((message) => (
        <p key={message} className="text-foreground">
          {message}
        </p>
      ))}
    </div>
  );
}
