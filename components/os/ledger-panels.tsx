import Link from "next/link";

import {
  daysUntil,
  formatDate,
  formatMonthLabel,
  formatNumber,
  formatSekDelta,
  formatSekTile,
} from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import type { LedgerSnapshot, OsSnapshot } from "@/lib/os/types";
import { CumulativeCurve, DualTrendChart, MonthlyBars } from "@/components/os/charts";
import { EntryList, NoticeCard, Panel, Row } from "@/components/os/ui";

export function LedgerProblem({ snapshot }: { snapshot: OsSnapshot }) {
  if (!snapshot.ledgerError) return null;
  return (
    <NoticeCard
      title="The ledger could not be read"
      detail={snapshot.ledgerError}
    />
  );
}

export function deltaTone(current: number, previous: number) {
  if (current > previous) return "positive" as const;
  if (current < previous) return "negative" as const;
  return "default" as const;
}

export function vsLast(current: number, previous: number, lastMonth: string) {
  return `${formatSekDelta(current - previous)} vs ${formatMonthLabel(lastMonth)}`;
}

/** Revenue against expense over the trailing twelve months. */
export function RevenueChart({ ledger, title = "Revenue vs expense" }: { ledger: LedgerSnapshot; title?: string }) {
  if (!ledger.months.some((row) => row.incomeCents || row.expenseCents)) return null;
  const labels = ledger.months.map((row) => formatMonthLabel(row.month));
  return (
    <Panel
      title={title}
      action={
        <span className="flex gap-3 text-xs">
          <span className="text-brand">In {formatSekTile(ledger.incomeYtdCents)}</span>
          <span className="text-muted-foreground">Out {formatSekTile(ledger.expenseYtdCents)}</span>
        </span>
      }
    >
      <DualTrendChart
        labels={labels}
        series={[
          { key: "rev", label: "Revenue", values: ledger.months.map((row) => row.incomeCents), fill: true },
          { key: "exp", label: "Expense", values: ledger.months.map((row) => row.expenseCents), tone: "muted" },
        ]}
      />
    </Panel>
  );
}

/**
 * The running result across the whole booked history, one point per entry, so
 * every payment in and out is visible in the shape of the line.
 */
export function RunningResult({ ledger }: { ledger: LedgerSnapshot }) {
  const points = ledger.cumulative;
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const biggest = points.reduce((top, point) =>
    Math.abs(point.deltaCents) > Math.abs(top.deltaCents) ? point : top,
  );

  return (
    <Panel
      title="Running result"
      action={
        <span className="text-sm font-semibold tabular-nums">{formatSekTile(last.totalCents)}</span>
      }
      footer={`${formatNumber(points.length)} booked movements from ${formatDate(first.date)}. Biggest single move: ${
        biggest.label
      } ${formatSekDelta(biggest.deltaCents)}. Hold and drag across the line to read each one.`}
    >
      <CumulativeCurve points={points} />
    </Panel>
  );
}

/** The headline graph: profit or loss, month by month. */
export function ResultBars({ ledger }: { ledger: LedgerSnapshot }) {
  if (!ledger.months.some((row) => row.resultCents)) return null;
  const best = ledger.months.reduce((top, row) => (row.resultCents > top.resultCents ? row : top));
  return (
    <Panel
      title="Result per month"
      action={
        <span className="text-xs text-muted-foreground">
          Best {formatMonthLabel(best.month)} · {formatSekTile(best.resultCents)}
        </span>
      }
      footer={`Revenue minus expenses for each of the last 12 months. ${formatSekTile(
        ledger.profitYtdCents,
      )} booked so far in ${ledger.year}.`}
    >
      <MonthlyBars
        labels={ledger.months.map((row) => formatMonthLabel(row.month))}
        values={ledger.months.map((row) => row.resultCents)}
      />
    </Panel>
  );
}

/**
 * What the company will owe. Both figures come off the booked ledger, so they
 * move as entries are added and neither is the filed declaration.
 */
export function TaxPanel({
  ledger,
  upcoming,
  todayYmd,
}: {
  ledger: LedgerSnapshot;
  upcoming: OsSnapshot["upcoming"];
  todayYmd: string;
}) {
  const vatToPay = Math.max(0, ledger.vatPayableCents);
  const setAside = ledger.corpTaxEstimateCents + vatToPay;
  const dates = upcoming.filter((item) => item.kind === "tax").slice(0, 3);

  return (
    <Panel
      title="Upcoming tax"
      footer="Estimated from the booked ledger. Depreciation, periodiseringsfond and non-deductible costs are not applied, so the declaration will differ."
    >
      <Row
        primary={`Bolagsskatt ${ledger.year}`}
        secondary={`20.6% of ${formatSekTile(ledger.profitYtdCents)} booked result`}
        value={formatSekTile(ledger.corpTaxEstimateCents)}
      />
      <Row
        primary="Moms"
        secondary={
          ledger.vatPayableCents >= 0
            ? "Utgående minus ingående moms"
            : "Ingående moms exceeds utgående — to reclaim"
        }
        value={formatSekTile(ledger.vatPayableCents)}
        valueTone={ledger.vatPayableCents < 0 ? "positive" : "default"}
      />
      <Row
        primary="Set aside in total"
        secondary={`Leaves ${formatSekTile(ledger.bankCents - setAside)} of the booked ${formatSekTile(
          ledger.bankCents,
        )}`}
        value={formatSekTile(setAside)}
        valueTone={ledger.bankCents - setAside < 0 ? "negative" : "default"}
      />
      {dates.map((item) => {
        const days = daysUntil(todayYmd, item.date);
        return (
          <Row
            key={item.id}
            primary={item.title}
            secondary={
              days == null
                ? item.detail
                : days <= 0
                  ? "Due today or passed"
                  : `In ${days} day${days === 1 ? "" : "s"}`
            }
            value={formatDate(item.date)}
            valueTone="muted"
          />
        );
      })}
    </Panel>
  );
}

export function CashAndProfitCharts({ ledger }: { ledger: LedgerSnapshot }) {
  const labels = ledger.months.map((row) => formatMonthLabel(row.month));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Panel
        title="Cash 1930"
        action={<span className="text-sm font-semibold tabular-nums">{formatSekTile(ledger.bankCents)}</span>}
      >
        <DualTrendChart
          compact
          labels={labels}
          series={[{ key: "bank", label: "Cash 1930", values: ledger.months.map((row) => row.bankCents), fill: true }]}
        />
      </Panel>
      <Panel
        title="Monthly result"
        action={<span className="text-sm font-semibold tabular-nums">{formatSekTile(ledger.profitYtdCents)} YTD</span>}
      >
        <DualTrendChart
          compact
          labels={labels}
          series={[{ key: "profit", label: "Result", values: ledger.months.map((row) => row.resultCents), fill: true }]}
        />
      </Panel>
    </div>
  );
}

export function LatestEntries({
  ledger,
  vaultHref,
}: {
  ledger: LedgerSnapshot;
  vaultHref: string;
}) {
  return (
    <Panel
      title="Latest entries"
      action={
        <Link className="text-xs font-semibold text-brand" href={routeHref(vaultHref)}>
          Open Bokföring
        </Link>
      }
    >
      <EntryList entries={ledger.recent.slice(0, 8)} vaultBase={vaultHref} />
    </Panel>
  );
}
