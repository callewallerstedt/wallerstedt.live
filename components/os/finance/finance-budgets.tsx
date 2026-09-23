"use client";

import { useMemo, useState } from "react";
import { CheckIcon, Loader2Icon, PencilIcon, XIcon } from "lucide-react";

import { BudgetBar, MiniBars } from "@/components/os/finance/finance-charts";
import {
  categoryMeta,
  CategoryDot,
  kr,
  SPENDING_CATEGORIES,
  type FinanceApi,
  type FinanceSummary,
} from "@/components/os/finance/shared";
import { Panel, SectionLabel } from "@/components/os/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinanceBudgets({
  summary,
  api,
  onChanged,
}: {
  summary: FinanceSummary;
  api: FinanceApi;
  onChanged: () => Promise<unknown>;
}) {
  const m = summary.month;
  const pace = m.isCurrent ? m.dayOfMonth / m.daysInMonth : null;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const byId = useMemo(() => new Map(summary.categories.map((row) => [row.id, row])), [summary.categories]);
  const trendFor = (id: string) => summary.history.slice(-6).map((month) => month.byCategory[id] ?? 0);

  const budgeted = SPENDING_CATEGORIES.filter((category) => byId.get(category.id)?.budgetCents != null).map(
    (category) => byId.get(category.id)!,
  );
  const unbudgeted = SPENDING_CATEGORIES.filter((category) => byId.get(category.id)?.budgetCents == null)
    .map((category) => byId.get(category.id) ?? { id: category.id, spentCents: 0, avgCents: null, budgetCents: null, count: 0 })
    .sort((a, b) => (b.avgCents ?? b.spentCents) - (a.avgCents ?? a.spentCents));
  const visibleUnbudgeted = showAll ? unbudgeted : unbudgeted.filter((row) => row.spentCents > 0 || (row.avgCents ?? 0) > 0);

  async function save(entries: Array<{ category: string; monthlySek: number | null }>) {
    setSaving(true);
    setError(null);
    try {
      await api.send("PUT", "/budgets", { budgets: entries });
      setEditing(null);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the budget.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(id: string, cents: number | null, suggestion?: number | null) {
    setEditing(id);
    const base = cents ?? suggestion ?? null;
    setDraft(base ? String(Math.round(base / 100)) : "");
  }

  function commit(id: string) {
    const value = Number(draft.replace(/\s/g, "").replace(",", "."));
    void save([{ category: id, monthlySek: Number.isFinite(value) && value > 0 ? value : null }]);
  }

  const suggestionFor = (id: string) => summary.suggestedBudgets.find((row) => row.category === id)?.suggestedCents ?? null;

  function editRow(id: string) {
    return (
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          commit(id);
        }}
      >
        <div className="relative flex-1">
          <input
            autoFocus
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 pr-14 text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            inputMode="numeric"
            placeholder="Amount"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">kr/mo</span>
        </div>
        <Button aria-label="Save" disabled={saving} size="icon" type="submit" variant="brand">
          {saving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        </Button>
        <Button aria-label="Cancel" onClick={() => setEditing(null)} size="icon" type="button" variant="ghost">
          <XIcon />
        </Button>
        {byId.get(id)?.budgetCents != null ? (
          <Button onClick={() => void save([{ category: id, monthlySek: null }])} size="sm" type="button" variant="destructive">
            Remove
          </Button>
        ) : null}
      </form>
    );
  }

  return (
    <>
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Monthly budget" value={m.totalBudgetCents ? kr(m.totalBudgetCents) : "—"} hint={`${budgeted.length} categories`} />
        <Stat label="Spent in budgets" value={kr(m.budgetedSpentCents)} hint={m.totalBudgetCents ? `${Math.round((m.budgetedSpentCents / m.totalBudgetCents) * 100)}% used` : undefined} />
        <Stat
          label="Left"
          value={m.budgetLeftCents == null ? "—" : kr(m.budgetLeftCents)}
          tone={(m.budgetLeftCents ?? 0) < 0 ? "negative" : "positive"}
          hint={pace != null ? `${Math.round(pace * 100)}% of the month gone` : undefined}
        />
        <Stat
          label="Per day left"
          value={m.budgetPerDayLeftCents == null ? "—" : kr(m.budgetPerDayLeftCents)}
          hint={m.isCurrent ? `${m.daysInMonth - m.dayOfMonth + 1} days to go` : "Past month"}
        />
      </section>

      {error ? <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm ring-1 ring-destructive/30">{error}</p> : null}

      {summary.suggestedBudgets.length ? (
        <div className="flex flex-col gap-2 rounded-xl bg-brand-soft/50 p-3 ring-1 ring-brand/25 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Quick start: budgets from your habits</p>
            <p className="text-xs text-muted-foreground">
              {summary.suggestedBudgets
                .map((row) => `${categoryMeta(row.category).emoji} ${kr(row.suggestedCents)}`)
                .join(" · ")}{" "}
              — about 10% under what you normally spend.
            </p>
          </div>
          <Button
            disabled={saving}
            onClick={() =>
              void save(summary.suggestedBudgets.map((row) => ({ category: row.category, monthlySek: row.suggestedCents / 100 })))
            }
            size="sm"
            variant="brand"
          >
            Use these
          </Button>
        </div>
      ) : null}

      <SectionLabel>Your budgets</SectionLabel>
      <Panel footer={pace != null ? "The thin line marks where you'd be if you spent evenly through the month." : undefined}>
        {budgeted.length ? (
          budgeted
            .sort((a, b) => (b.usedRatio ?? 0) - (a.usedRatio ?? 0))
            .map((row) => {
              const meta = categoryMeta(row.id);
              const ratio = row.budgetCents ? row.spentCents / row.budgetCents : 0;
              const left = (row.budgetCents ?? 0) - row.spentCents;
              return (
                <div key={row.id} className="border-t border-border px-3 py-2.5 first:border-t-0">
                  <div className="flex items-center gap-3">
                    <CategoryDot id={row.id} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium">{meta.label}</p>
                        <p className="shrink-0 text-sm tabular-nums">
                          <span className="font-semibold">{kr(row.spentCents)}</span>
                          <span className="text-muted-foreground"> / {kr(row.budgetCents)}</span>
                        </p>
                      </div>
                      <div className="mt-1.5">
                        <BudgetBar ratio={ratio} pace={pace} color={meta.color} />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[0.7rem] text-muted-foreground">
                        <span className={cn(left < 0 && "font-semibold text-destructive")}>
                          {left >= 0 ? `${kr(left)} left` : `${kr(-left)} over`}
                          {row.avgCents ? ` · usual ${kr(row.avgCents)}` : ""}
                        </span>
                        <button
                          className="inline-flex items-center gap-1 font-semibold text-brand"
                          onClick={() => startEdit(row.id, row.budgetCents)}
                          type="button"
                        >
                          <PencilIcon className="size-3" /> Edit
                        </button>
                      </div>
                    </div>
                  </div>
                  {editing === row.id ? editRow(row.id) : null}
                </div>
              );
            })
        ) : (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No budgets yet. Pick a category below, e.g. 1 000 kr a month for fast food, and the bar fills as you spend.
          </p>
        )}
      </Panel>

      <SectionLabel
        action={
          <button className="text-xs font-semibold text-brand" onClick={() => setShowAll((value) => !value)} type="button">
            {showAll ? "Only used ones" : "Show all"}
          </button>
        }
      >
        Without a budget
      </SectionLabel>
      <Panel>
        {visibleUnbudgeted.length ? (
          visibleUnbudgeted.map((row) => {
            const meta = categoryMeta(row.id);
            const suggestion = suggestionFor(row.id);
            return (
              <div key={row.id} className="border-t border-border px-3 py-2 first:border-t-0">
                <div className="flex items-center gap-3">
                  <CategoryDot id={row.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{meta.label}</p>
                    <p className="text-[0.7rem] text-muted-foreground">
                      {kr(row.spentCents)} this month{row.avgCents ? ` · usual ${kr(row.avgCents)}` : ""}
                    </p>
                  </div>
                  <MiniBars values={trendFor(row.id)} color={meta.color} />
                  <Button onClick={() => startEdit(row.id, null, suggestion)} size="xs" variant="outline">
                    Set
                  </Button>
                </div>
                {editing === row.id ? editRow(row.id) : null}
              </div>
            );
          })
        ) : (
          <p className="px-3 py-4 text-sm text-muted-foreground">Every category with spending has a budget.</p>
        )}
      </Panel>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="min-w-0 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[0.7rem] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
