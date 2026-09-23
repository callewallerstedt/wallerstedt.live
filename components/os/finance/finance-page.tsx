"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LandmarkIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";

import { FinanceActivity } from "@/components/os/finance/finance-activity";
import { FinanceBudgets } from "@/components/os/finance/finance-budgets";
import { FinanceOverview } from "@/components/os/finance/finance-overview";
import { FinanceWealth } from "@/components/os/finance/finance-wealth";
import {
  financeApi,
  monthLabel,
  relativeTime,
  Segmented,
  shiftMonth,
  type FinanceSummary,
} from "@/components/os/finance/shared";
import { PageFrame } from "@/components/os/ui";
import { registerCustomCategories } from "@/lib/finance/categories";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type View = "overview" | "budgets" | "activity" | "wealth";
const VIEW_KEY = "calle-finance-view";
/** Refresh from the bank on open when the data is older than this. */
const STALE_MS = 45 * 60_000;

export function FinancePage({ accessKey }: { accessKey: string }) {
  const api = useRef(financeApi(accessKey)).current;
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const autoSynced = useRef(false);

  const load = useCallback(
    async (targetMonth?: string | null) => {
      try {
        const query = targetMonth ? `?month=${targetMonth}` : "";
        const data = await api.get<FinanceSummary>(query);
        registerCustomCategories(data.customCategories);
        setSummary(data);
        setError(null);
        return data;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load your finances.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  const sync = useCallback(
    async (force = true) => {
      setSyncing(true);
      try {
        const result = await api.send<{ ok: boolean; errors: string[]; needsReconnect: boolean; newTransactions: number; skipped?: string }>(
          "POST",
          "/sync",
          { force },
        );
        if (result.needsReconnect) {
          setFlash({ tone: "bad", text: "The bank consent has expired. Reconnect with BankID below." });
        } else if (result.errors.length) {
          setFlash({ tone: "bad", text: result.errors[0]! });
        } else if (force && !result.skipped) {
          setFlash({
            tone: "good",
            text: result.newTransactions ? `Updated · ${result.newTransactions} new transactions` : "Up to date",
          });
        }
      } catch (caught) {
        setFlash({ tone: "bad", text: caught instanceof Error ? caught.message : "Sync failed." });
      } finally {
        setSyncing(false);
        await load(month);
      }
    },
    [api, load, month],
  );

  // First load, the view the owner last used, and the result of a bank redirect.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY) as View | null;
      if (saved && ["overview", "budgets", "activity", "wealth"].includes(saved)) setView(saved);
    } catch {
      // Private mode: fine, start on the overview.
    }
    const params = new URLSearchParams(window.location.search);
    const bank = params.get("bank");
    if (bank) {
      setFlash({
        tone: bank === "connected" ? "good" : "bad",
        text: params.get("message") || (bank === "connected" ? "Bank connected." : "Bank connection failed."),
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
    void load(null);
  }, [load]);

  // Pull fresh numbers when the page opens on stale data.
  useEffect(() => {
    if (!summary || autoSynced.current) return;
    autoSynced.current = true;
    const hasBank = summary.connection.banks.some((bank) => bank.status === "active");
    const last = summary.lastSync?.at ? new Date(summary.lastSync.at).getTime() : 0;
    if (hasBank && Date.now() - last > STALE_MS) void sync(false);
  }, [summary, sync]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 7000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function changeView(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Ignore.
    }
  }

  function changeMonth(next: string) {
    setMonth(next);
    void load(next);
  }

  async function connect(bank?: string, country?: string) {
    try {
      const result = await api.send<{ url: string }>("POST", "/connect", bank ? { bank, country } : {});
      window.location.href = result.url;
    } catch (caught) {
      setFlash({ tone: "bad", text: caught instanceof Error ? caught.message : "Could not start the bank login." });
    }
  }

  const currentMonth = summary?.today.slice(0, 7) ?? null;
  const shownMonth = summary?.month.month ?? month;

  return (
    <PageFrame>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Privat</h1>
          <p className="truncate text-xs text-muted-foreground">
            {summary
              ? `${summary.connection.banks.map((bank) => bank.bank).join(" · ") || "No bank connected"} · updated ${relativeTime(summary.lastSync?.at)}`
              : "Your own money, outside the company books"}
          </p>
        </div>
        <Button
          aria-label="Refresh from the bank"
          disabled={syncing || !summary?.connection.banks.some((bank) => bank.status === "active")}
          onClick={() => void sync(true)}
          size="sm"
          variant="outline"
        >
          <RefreshCwIcon className={cn(syncing && "animate-spin")} />
          {syncing ? "Syncing" : "Refresh"}
        </Button>
      </div>

      {flash ? (
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-sm ring-1",
            flash.tone === "good" ? "bg-positive/10 ring-positive/30" : "bg-destructive/10 ring-destructive/30",
          )}
        >
          {flash.text}
        </div>
      ) : null}

      {summary ? <ConnectionNotice summary={summary} onConnect={connect} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={view}
          onChange={changeView}
          options={[
            { value: "overview", label: "Overview" },
            { value: "budgets", label: "Budgets" },
            { value: "activity", label: "Activity" },
            { value: "wealth", label: "Wealth" },
          ]}
        />
        {shownMonth && view !== "wealth" ? (
          <div className="flex items-center gap-1">
            <Button aria-label="Previous month" onClick={() => changeMonth(shiftMonth(shownMonth, -1))} size="icon-sm" variant="ghost">
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">{monthLabel(shownMonth)}</span>
            <Button
              aria-label="Next month"
              disabled={!currentMonth || shownMonth >= currentMonth}
              onClick={() => changeMonth(shiftMonth(shownMonth, 1))}
              size="icon-sm"
              variant="ghost"
            >
              <ChevronRightIcon />
            </Button>
          </div>
        ) : null}
      </div>

      {loading && !summary ? (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2Icon className="size-6 animate-spin" />
        </div>
      ) : error && !summary ? (
        <div className="rounded-xl bg-destructive/10 px-3 py-3 text-sm ring-1 ring-destructive/30">{error}</div>
      ) : summary ? (
        view === "overview" ? (
          <FinanceOverview summary={summary} api={api} onSelectMonth={changeMonth} onGoTo={changeView} onChanged={() => load(month)} />
        ) : view === "budgets" ? (
          <FinanceBudgets summary={summary} api={api} onChanged={() => load(month)} />
        ) : view === "activity" ? (
          <FinanceActivity summary={summary} api={api} month={summary.month.month} onChanged={() => load(month)} />
        ) : (
          <FinanceWealth summary={summary} api={api} onChanged={() => load(month)} onConnect={connect} />
        )
      ) : null}
    </PageFrame>
  );
}

function ConnectionNotice({
  summary,
  onConnect,
}: {
  summary: FinanceSummary;
  onConnect: (bank?: string, country?: string) => void;
}) {
  const { connection } = summary;
  if (!connection.configured) {
    return (
      <div className="rounded-xl bg-card px-3 py-3 text-sm ring-1 ring-foreground/10">
        Enable Banking is not configured on the server yet (ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY).
      </div>
    );
  }
  const expired = connection.banks.filter((bank) => bank.status === "expired");
  const soon = connection.banks.filter((bank) => bank.status === "active" && bank.daysLeft != null && bank.daysLeft <= 14);
  if (connection.needsConnect && !expired.length) {
    return (
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-brand/30">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <LandmarkIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Connect Handelsbanken</p>
            <p className="text-sm text-muted-foreground">
              Log in once with BankID. Read-only access to balances and transactions, renewed every 180 days.
            </p>
          </div>
          <Button onClick={() => onConnect()} size="lg" variant="brand">
            Connect with BankID
          </Button>
        </div>
      </div>
    );
  }
  const problem = expired[0] ?? soon[0];
  if (!problem) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-3 py-2.5 ring-1 ring-amber-500/40">
      <AlertTriangleIcon className="size-4 shrink-0 text-amber-500" />
      <p className="min-w-0 flex-1 text-sm">
        {problem.status === "expired"
          ? `${problem.bank}: access has expired. Balances are frozen until you reconnect.`
          : `${problem.bank}: access runs out in ${problem.daysLeft} day${problem.daysLeft === 1 ? "" : "s"}.`}
      </p>
      <Button onClick={() => onConnect(problem.bank, problem.country)} size="sm" variant="brand">
        Reconnect
      </Button>
    </div>
  );
}
