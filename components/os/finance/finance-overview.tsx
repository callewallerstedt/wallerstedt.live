"use client";

import { useState } from "react";
import { ArrowDownRightIcon, ArrowUpRightIcon, Loader2Icon, SparklesIcon } from "lucide-react";

import {
  BalanceLine,
  CategoryDonut,
  IncomeSpendBars,
  PaceChart,
  WeekdayBars,
} from "@/components/os/finance/finance-charts";
import {
  categoryMeta,
  CategoryDot,
  kr,
  merchantTitle,
  monthLabel,
  signedKr,
  type FinanceApi,
  type FinanceSummary,
} from "@/components/os/finance/shared";
import { EmptyState, Panel, SectionLabel } from "@/components/os/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Delta({ current, previous, invert = false }: { current: number; previous: number | null; invert?: boolean }) {
  if (previous == null || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  if (!Number.isFinite(change) || Math.abs(change) < 0.01) return null;
  const up = change > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[0.7rem] font-semibold", good ? "text-positive" : "text-destructive")}>
      <Icon className="size-3" />
      {Math.round(Math.abs(change) * 100)}%
    </span>
  );
}

function Hero({
  label,
  value,
  hint,
  extra,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  extra?: React.ReactNode;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="min-w-0 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
      <p className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        {extra}
      </p>
      <p
        className={cn(
          "mt-0.5 text-2xl leading-tight font-semibold tabular-nums tracking-tight",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[0.7rem] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function FinanceOverview({
  summary,
  api,
  onSelectMonth,
  onGoTo,
}: {
  summary: FinanceSummary;
  api: FinanceApi;
  onSelectMonth: (month: string) => void;
  onGoTo: (view: "budgets" | "activity" | "wealth") => void;
}) {
  const m = summary.month;
  const spendingCategories = summary.categories.filter((row) => row.spentCents > 0);
  const hasData = summary.history.some((row) => row.hasData);
  const recentHistory = summary.history.slice(-12);

  if (!summary.accounts.length) {
    return (
      <Panel>
        <EmptyState
          title="Nothing here yet"
          detail="Connect your bank above. The first sync pulls up to two years of transactions and sorts them into categories automatically."
        />
      </Panel>
    );
  }

  return (
    <>
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Hero
          label="On your accounts"
          value={kr(summary.totals.bankCents)}
          hint={`${summary.accounts.filter((account) => !account.hidden).length} accounts${summary.totals.assetsCents ? ` · net worth ${kr(summary.totals.netWorthCents)}` : ""}`}
        />
        <Hero
          label={m.isCurrent ? "Spent this month" : `Spent in ${monthLabel(m.month, "short")}`}
          value={kr(m.spendingCents)}
          extra={<Delta current={m.isCurrent ? m.projectedSpendingCents : m.spendingCents} previous={m.avgSpendingCents} invert />}
          hint={
            m.isCurrent
              ? `On pace for ${kr(m.projectedSpendingCents)}${m.avgSpendingCents ? ` · usual ${kr(m.avgSpendingCents)}` : ""}`
              : m.avgSpendingCents
                ? `Usual month ${kr(m.avgSpendingCents)}`
                : `${kr(m.dailyAverageCents)} a day`
          }
        />
        <Hero
          label="Came in"
          value={kr(m.incomeCents)}
          extra={m.isCurrent ? null : <Delta current={m.incomeCents} previous={m.avgIncomeCents} />}
          hint={m.savedCents > 0 ? `${kr(m.savedCents)} moved to savings` : m.avgIncomeCents ? `Usual ${kr(m.avgIncomeCents)}` : undefined}
        />
        {m.totalBudgetCents ? (
          <Hero
            label="Left in budgets"
            value={kr(m.budgetLeftCents)}
            tone={(m.budgetLeftCents ?? 0) < 0 ? "negative" : "positive"}
            hint={m.budgetPerDayLeftCents != null ? `${kr(m.budgetPerDayLeftCents)} per day to stay on track` : `of ${kr(m.totalBudgetCents)}`}
          />
        ) : (
          <Hero
            label="Net this month"
            value={signedKr(m.netCents)}
            tone={m.netCents < 0 ? "negative" : "positive"}
            hint={m.savingsRate != null ? `Kept ${Math.round(m.savingsRate * 100)}% of income` : "Income minus spending"}
          />
        )}
      </section>

      {summary.insights.length ? (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {summary.insights.map((insight, index) => {
            const meta = insight.category ? categoryMeta(insight.category) : null;
            return (
              <div
                key={index}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1",
                  insight.tone === "bad" && "bg-destructive/10 ring-destructive/30",
                  insight.tone === "warn" && "bg-amber-500/10 ring-amber-500/30",
                  insight.tone === "good" && "bg-positive/10 ring-positive/30",
                  insight.tone === "info" && "bg-card ring-foreground/10",
                )}
              >
                {meta ? <span>{meta.emoji}</span> : null}
                <span>
                  {meta ? <b className="font-semibold">{meta.label}: </b> : null}
                  {insight.text}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <Panel
        title="Spending pace"
        action={
          <span className="flex items-center gap-3 text-[0.68rem] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-3 rounded bg-brand" /> {monthLabel(m.month, "short")}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-3 rounded bg-foreground/40" /> last month
            </span>
            {m.totalBudgetCents ? (
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-3 rounded bg-positive" /> budget
              </span>
            ) : null}
          </span>
        }
      >
        <div className="px-1 pb-2">
          <PaceChart
            cumulative={summary.daily.cumulative}
            previous={summary.daily.prevCumulative}
            daysInMonth={m.daysInMonth}
            budgetTotal={m.totalBudgetCents || null}
            projected={m.isCurrent ? m.projectedSpendingCents : null}
          />
        </div>
      </Panel>

      <div className="grid gap-2 lg:grid-cols-[1.1fr_1fr]">
        <Panel
          title="Where it went"
          action={
            <button className="text-xs font-semibold text-brand" onClick={() => onGoTo("budgets")} type="button">
              Budgets
            </button>
          }
        >
          {spendingCategories.length ? (
            <div className="flex flex-col items-center gap-3 px-3 pb-3 sm:flex-row sm:items-start">
              <CategoryDonut
                caption="spent"
                total={m.spendingCents}
                slices={spendingCategories.map((row) => {
                  const meta = categoryMeta(row.id);
                  return { id: row.id, value: row.spentCents, color: meta.color, label: meta.label };
                })}
              />
              <div className="w-full min-w-0 flex-1">
                {spendingCategories.slice(0, 9).map((row) => {
                  const meta = categoryMeta(row.id);
                  return (
                    <div key={row.id} className="flex items-center gap-2 py-1.5">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {meta.emoji} {meta.label}
                      </span>
                      <span className="w-10 text-right text-[0.7rem] text-muted-foreground tabular-nums">
                        {Math.round(row.share * 100)}%
                      </span>
                      <span className="w-20 text-right text-sm font-semibold tabular-nums">{kr(row.spentCents)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState title="No spending yet" detail="Nothing has left the accounts this month." />
          )}
        </Panel>

        <SaveMore summary={summary} api={api} onGoTo={onGoTo} />
      </div>

      {hasData ? (
        <Panel
          title="In and out, 12 months"
          action={
            <span className="flex items-center gap-3 text-[0.68rem] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-positive" /> in
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-brand" /> out
              </span>
            </span>
          }
          footer="Tap a month to open it. Transfers between your own accounts and money moved to savings are left out."
        >
          <div className="px-1">
            <IncomeSpendBars
              months={recentHistory}
              labels={recentHistory.map((row) => monthLabel(row.month, "short"))}
              selected={m.month}
              onSelect={onSelectMonth}
            />
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-2 lg:grid-cols-2">
        <Panel title="Top places" footer={`${monthLabel(m.month)} · by money spent`}>
          {summary.merchants.length ? (
            summary.merchants.slice(0, 8).map((row) => (
              <div key={row.merchant} className="flex min-h-11 items-center gap-3 border-t border-border px-3 py-1.5 first:border-t-0">
                <CategoryDot id={row.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{merchantTitle({ merchant: row.merchant, counterparty: "", description: "" })}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.count} {row.count === 1 ? "purchase" : "purchases"} · {categoryMeta(row.category).label}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{kr(row.cents)}</p>
              </div>
            ))
          ) : (
            <EmptyState title="No purchases" detail="Nothing spent this month yet." />
          )}
        </Panel>

        <Panel
          title="Repeating payments"
          footer={
            summary.recurring.length
              ? `About ${kr(summary.recurring.reduce((sum, row) => sum + row.monthlyCents, 0))} a month · ${kr(summary.recurring.reduce((sum, row) => sum + row.monthlyCents, 0) * 12)} a year`
              : "Paid in at least three of the last four months."
          }
        >
          {summary.recurring.length ? (
            summary.recurring.slice(0, 10).map((row) => (
              <div key={row.merchant} className="flex min-h-11 items-center gap-3 border-t border-border px-3 py-1.5 first:border-t-0">
                <CategoryDot id={row.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{merchantTitle({ merchant: row.merchant, counterparty: "", description: "" })}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.steady ? "Fixed" : "Varies"} · last {row.lastDate}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  {kr(row.monthlyCents)}
                  <span className="text-xs font-normal text-muted-foreground">/mo</span>
                </p>
              </div>
            ))
          ) : (
            <EmptyState title="None found yet" detail="Needs a few months of history to spot subscriptions." />
          )}
        </Panel>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <Panel title="Biggest purchases" footer={monthLabel(m.month)}>
          {summary.biggest.length ? (
            summary.biggest.map((row) => (
              <div key={row.id} className="flex min-h-11 items-center gap-3 border-t border-border px-3 py-1.5 first:border-t-0">
                <CategoryDot id={row.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{merchantTitle(row)}</p>
                  <p className="text-xs text-muted-foreground">{row.date}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{kr(-row.amountCents)}</p>
              </div>
            ))
          ) : (
            <EmptyState title="Nothing yet" detail="No purchases this month." />
          )}
        </Panel>
        <Panel title="Which days you spend" footer="Share of spending per weekday, over your normal months.">
          <WeekdayBars values={summary.weekday} />
        </Panel>
      </div>

      {summary.balanceHistory.length > 2 ? (
        <>
          <SectionLabel
            action={
              <button className="text-xs font-semibold text-brand" onClick={() => onGoTo("wealth")} type="button">
                Wealth
              </button>
            }
          >
            Balance over time
          </SectionLabel>
          <Panel>
            <div className="px-1 pt-2">
              <BalanceLine points={summary.balanceHistory} label="Total bank balance over time" />
            </div>
          </Panel>
        </>
      ) : null}
    </>
  );
}

function SaveMore({
  summary,
  api,
  onGoTo,
}: {
  summary: FinanceSummary;
  api: FinanceApi;
  onGoTo: (view: "budgets") => void;
}) {
  const [coach, setCoach] = useState(summary.coach);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const yearly = summary.tips.reduce((sum, tip) => sum + (tip.yearlyCents ?? 0), 0);

  async function ask(withQuestion: boolean) {
    setAsking(true);
    setError(null);
    try {
      const result = await api.send<{ coach: NonNullable<FinanceSummary["coach"]> }>("POST", "/coach", {
        month: summary.month.month,
        ...(withQuestion && question.trim() ? { question } : {}),
      });
      if (withQuestion && question.trim()) setAnswer(result.coach.text);
      else setCoach(result.coach);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The coach is unavailable.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <Panel
      title="Save more"
      action={
        yearly > 0 ? (
          <span className="rounded-full bg-positive/15 px-2 py-0.5 text-xs font-semibold text-positive">
            up to {kr(yearly)}/yr
          </span>
        ) : null
      }
    >
      <div className="flex flex-col">
        {summary.tips.length ? (
          summary.tips.slice(0, 5).map((tip) => (
            <details key={tip.id} className="group border-t border-border px-3 py-2 first:border-t-0">
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <span className="text-base">
                  {tip.category ? categoryMeta(tip.category).emoji : tip.tone === "grow" ? "🌱" : tip.tone === "watch" ? "👀" : "💡"}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{tip.title}</span>
                {tip.yearlyCents ? (
                  <span className="shrink-0 text-xs font-semibold text-positive tabular-nums">+{kr(tip.yearlyCents)}/yr</span>
                ) : null}
              </summary>
              <p className="mt-1.5 pl-7 text-xs leading-relaxed text-muted-foreground">{tip.detail}</p>
            </details>
          ))
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">Tips appear once there is a month or two of history to compare.</p>
        )}

        {summary.suggestedBudgets.length ? (
          <button
            className="border-t border-border px-3 py-2 text-left text-xs font-semibold text-brand"
            onClick={() => onGoTo("budgets")}
            type="button"
          >
            {summary.suggestedBudgets.length} categories have no budget yet. Set them up →
          </button>
        ) : null}

        <div className="border-t border-border bg-brand-soft/40 px-3 py-3">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-brand" />
            <p className="flex-1 text-sm font-semibold">AI money coach</p>
            <Button disabled={asking} onClick={() => void ask(false)} size="xs" variant="outline">
              {asking && !question ? <Loader2Icon className="animate-spin" /> : null}
              {coach ? "Refresh" : "Analyse my month"}
            </Button>
          </div>
          {coach ? (
            <div className="mt-2 max-h-80 overflow-y-auto text-[0.8rem] leading-relaxed whitespace-pre-wrap">
              <CoachText text={coach.text} />
              <p className="mt-2 text-[0.65rem] text-muted-foreground">
                {coach.model} · {monthLabel(coach.month)} · {new Date(coach.at).toLocaleString("sv-SE")}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Reads this month&apos;s numbers and your habits, then gives you a plan with real kr amounts.
            </p>
          )}
          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(true);
            }}
          >
            <input
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background/60 px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="Ask: can I afford a 15 000 kr keyboard?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={500}
            />
            <Button disabled={asking || !question.trim()} size="sm" type="submit" variant="brand">
              {asking && question ? <Loader2Icon className="animate-spin" /> : "Ask"}
            </Button>
          </form>
          {answer ? (
            <div className="mt-2 rounded-lg bg-background/60 p-2 text-[0.8rem] leading-relaxed whitespace-pre-wrap ring-1 ring-foreground/10">
              <CoachText text={answer} />
            </div>
          ) : null}
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
      </div>
    </Panel>
  );
}

/** Just enough markdown for the coach: **bold** and line breaks. */
function CoachText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part.replace(/^#+\s*/gm, "")}</span>
        ),
      )}
    </>
  );
}
