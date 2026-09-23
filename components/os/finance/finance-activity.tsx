"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";

import {
  categoryMeta,
  CategoryDot,
  kr,
  merchantTitle,
  signedKr,
  type FinanceApi,
  type FinanceSummary,
  type FinanceTransactionView,
} from "@/components/os/finance/shared";
import { EmptyState, Panel } from "@/components/os/ui";
import { Button } from "@/components/ui/button";
import { FINANCE_CATEGORIES } from "@/lib/finance/categories";
import { cn } from "@/lib/utils";

const PAGE = 80;

export function FinanceActivity({
  summary,
  api,
  month,
  onChanged,
}: {
  summary: FinanceSummary;
  api: FinanceApi;
  month: string;
  onChanged: () => Promise<unknown>;
}) {
  const [rows, setRows] = useState<FinanceTransactionView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [account, setAccount] = useState("");
  const [allTime, setAllTime] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const accounts = useMemo(() => new Map(summary.accounts.map((row) => [row.id, row])), [summary.accounts]);

  const fetchPage = useCallback(
    async (offset: number) => {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (!allTime) params.set("month", month);
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      if (account) params.set("account", account);
      return api.get<{ total: number; transactions: FinanceTransactionView[] }>(`/transactions?${params}`);
    },
    // `reload` refetches after bulk changes such as the AI sort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, allTime, api, category, month, query, reload],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(0)
      .then((data) => {
        if (cancelled) return;
        setRows(data.transactions);
        setTotal(data.total);
        setError(null);
      })
      .catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : "Could not load."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  // Debounce the search box.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  async function more() {
    setLoading(true);
    try {
      const data = await fetchPage(rows.length);
      setRows((current) => [...current, ...data.transactions]);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  async function update(row: FinanceTransactionView, patch: { category?: string; note?: string; applyToMerchant?: boolean }) {
    const result = await api.send<{ transaction: FinanceTransactionView; appliedToOthers: number }>(
      "PATCH",
      `/transactions/${encodeURIComponent(row.id)}`,
      patch,
    );
    if (patch.applyToMerchant && patch.category) {
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? result.transaction
            : item.merchant === row.merchant && item.categorySource !== "manual"
              ? { ...item, category: patch.category!, categorySource: "rule" }
              : item,
        ),
      );
    } else {
      setRows((current) => current.map((item) => (item.id === row.id ? result.transaction : item)));
    }
    void onChanged();
    return result.appliedToOthers;
  }

  const groups = useMemo(() => {
    const map = new Map<string, FinanceTransactionView[]>();
    for (const row of rows) {
      const list = map.get(row.date) ?? [];
      list.push(row);
      map.set(row.date, list);
    }
    return [...map.entries()];
  }, [rows]);

  const listedIn = rows.filter((row) => row.amountCents > 0 && !row.isTransfer).reduce((sum, row) => sum + row.amountCents, 0);
  const listedOut = rows.filter((row) => row.amountCents < 0 && !row.isTransfer).reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-lg border border-input bg-card pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder="Search shops, notes, Swish names…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-2 text-sm sm:w-44"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {FINANCE_CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.emoji} {item.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-2 text-sm sm:w-40"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
          >
            <option value="">All accounts</option>
            {summary.accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {total} transactions · in <b className="text-positive">{kr(listedIn)}</b> · out <b className="text-foreground">{kr(-listedOut)}</b>
          {rows.length < total ? " (shown so far)" : ""}
        </span>
        <SortOtherButton
          api={api}
          onDone={async () => {
            setReload((value) => value + 1);
            await onChanged();
          }}
        />
        <label className="flex items-center gap-1.5">
          <input checked={allTime} onChange={(event) => setAllTime(event.target.checked)} type="checkbox" />
          Search all time
        </label>
      </div>

      {error ? <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm ring-1 ring-destructive/30">{error}</p> : null}

      <Panel>
        {groups.length ? (
          groups.map(([date, items]) => (
            <div key={date}>
              <div className="sticky top-0 z-[1] flex justify-between bg-card/95 px-3 pt-2.5 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
                <span>
                  {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span className="normal-case tabular-nums">
                  {signedKr(items.filter((row) => !row.isTransfer).reduce((sum, row) => sum + row.amountCents, 0))}
                </span>
              </div>
              {items.map((row) => (
                <TransactionRow
                  key={row.id}
                  row={row}
                  accountName={accounts.get(row.accountId)?.name ?? ""}
                  multipleAccounts={summary.accounts.length > 1}
                  open={open === row.id}
                  onToggle={() => setOpen((current) => (current === row.id ? null : row.id))}
                  onUpdate={(patch) => update(row, patch)}
                  onCreateCategory={async (input) => {
                    const result = await api.send<{ category: { id: string; label: string; emoji: string; kind: string } }>(
                      "POST",
                      "/categories",
                      input,
                    );
                    await onChanged();
                    return result.category.id;
                  }}
                />
              ))}
            </div>
          ))
        ) : loading ? (
          <div className="grid place-items-center py-10 text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
          </div>
        ) : (
          <EmptyState title="No transactions" detail={query || category || account ? "Nothing matches the filters." : "Nothing booked in this month yet."} />
        )}
        {rows.length < total ? (
          <div className="border-t border-border p-2">
            <Button className="w-full" disabled={loading} onClick={() => void more()} size="sm" variant="ghost">
              {loading ? <Loader2Icon className="animate-spin" /> : null}
              Load more ({total - rows.length} left)
            </Button>
          </div>
        ) : null}
      </Panel>
    </>
  );
}

function TransactionRow({
  row,
  accountName,
  multipleAccounts,
  open,
  onToggle,
  onUpdate,
  onCreateCategory,
}: {
  row: FinanceTransactionView;
  accountName: string;
  multipleAccounts: boolean;
  open: boolean;
  onToggle: () => void;
  onUpdate: (patch: { category?: string; note?: string; applyToMerchant?: boolean }) => Promise<number>;
  onCreateCategory: (input: { label: string; emoji: string; kind: string }) => Promise<string>;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ label: "", emoji: "", kind: "spending" });
  const [applyAll, setApplyAll] = useState(true);
  const [note, setNote] = useState(row.note);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const meta = categoryMeta(row.category);

  async function choose(id: string) {
    setBusy(true);
    setDone(null);
    try {
      const others = await onUpdate({ category: id, applyToMerchant: applyAll && Boolean(row.merchant) });
      setDone(others ? `Moved ${others} other ${row.merchant} purchases too, and future ones.` : "Saved.");
    } catch (caught) {
      setDone(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("border-t border-border first:border-t-0", open && "bg-muted/30")}>
      <button className="flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left" onClick={onToggle} type="button">
        <CategoryDot id={row.category} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {merchantTitle(row)}
            {row.pending ? <span className="ml-1.5 rounded bg-amber-500/15 px-1 text-[0.62rem] font-semibold text-amber-600 dark:text-amber-400">pending</span> : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {meta.label}
            {row.categorySource === "manual" || row.categorySource === "rule" ? " ✓" : ""}
            {multipleAccounts && accountName ? ` · ${accountName}` : ""}
            {row.note ? ` · ${row.note}` : ""}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            row.amountCents > 0 && "text-positive",
            row.isTransfer && "text-muted-foreground",
          )}
        >
          {signedKr(row.amountCents)}
        </p>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {row.description && row.description !== row.counterparty ? (
            <p className="text-xs text-muted-foreground">{row.description}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {FINANCE_CATEGORIES.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs ring-1 ring-foreground/10 transition-colors",
                  item.id === row.category ? "bg-brand-soft font-semibold ring-brand/50" : "bg-card hover:bg-muted",
                )}
                onClick={() => void choose(item.id)}
                type="button"
              >
                {item.emoji} {item.label}
              </button>
            ))}
            <button
              className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-brand ring-1 ring-brand/40"
              onClick={() => setCreating((value) => !value)}
              type="button"
            >
              + New category
            </button>
          </div>
          {creating ? (
            <form
              className="flex flex-wrap gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.label.trim()) return;
                setBusy(true);
                void onCreateCategory(draft)
                  .then((id) => {
                    setCreating(false);
                    setDraft({ label: "", emoji: "", kind: "spending" });
                    return choose(id);
                  })
                  .catch((caught) => setDone(caught instanceof Error ? caught.message : "Could not create it."))
                  .finally(() => setBusy(false));
              }}
            >
              <input
                className="h-8 w-12 rounded-lg border border-input bg-background px-2 text-center text-sm"
                maxLength={8}
                placeholder="🏷️"
                value={draft.emoji}
                onChange={(event) => setDraft({ ...draft, emoji: event.target.value })}
              />
              <input
                autoFocus
                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm"
                maxLength={40}
                placeholder="Name, e.g. Presenter"
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
              <select
                className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                value={draft.kind}
                onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
              >
                <option value="spending">Counts as spending</option>
                <option value="neutral">Not spending (excluded)</option>
                <option value="income">Income</option>
              </select>
              <Button disabled={busy || !draft.label.trim()} size="sm" type="submit" variant="brand">
                Create
              </Button>
            </form>
          ) : null}
          {row.merchant ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input checked={applyAll} onChange={(event) => setApplyAll(event.target.checked)} type="checkbox" />
              Always use this for “{row.merchant}”
            </label>
          ) : null}
          <form
            className="flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              void onUpdate({ note })
                .then(() => setDone("Note saved."))
                .finally(() => setBusy(false));
            }}
          >
            <input
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="Add a note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
            />
            <Button disabled={busy || note === row.note} size="sm" type="submit" variant="outline">
              Save
            </Button>
          </form>
          {done ? <p className="text-xs text-muted-foreground">{done}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function SortOtherButton({ api, onDone }: { api: FinanceApi; onDone: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <Button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setResult(null);
          void api
            .send<{ merchants: number; transactions: number }>("POST", "/sort-other")
            .then((data) => {
              setResult(data.transactions ? `Sorted ${data.transactions} transactions (${data.merchants} places)` : "Nothing left to sort");
              return onDone();
            })
            .catch((caught) => setResult(caught instanceof Error ? caught.message : "Could not sort."))
            .finally(() => setBusy(false));
        }}
        size="xs"
        variant="outline"
      >
        {busy ? <Loader2Icon className="animate-spin" /> : "✨"} Sort “Other” with AI
      </Button>
      {result ? <span>{result}</span> : null}
    </span>
  );
}
