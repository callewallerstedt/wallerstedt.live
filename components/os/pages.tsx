import Link from "next/link";

import {
  daysUntil,
  formatCompactCount,
  formatDate,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  formatSek,
  formatSekDelta,
  formatSekTile,
  formatUsd,
} from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import type { LedgerSnapshot, OsSnapshot } from "@/lib/os/types";
import { CumulativeCurve, DualTrendChart, MonthlyBars } from "@/components/os/charts";
import { MusicDashboard } from "@/components/os/music";
import { ActionQueue, TaskList } from "@/components/os/tasks";
import { AppearanceSettings, SignOutRow } from "@/components/os/settings";
import {
  ConnectFootnote,
  EmptyState,
  EntryList,
  HeroStats,
  KpiCard,
  KpiGrid,
  NoticeCard,
  Panel,
  Pill,
  PageFrame,
  PageTitle,
  Row,
  SectionLabel,
} from "@/components/os/ui";

function LedgerProblem({ snapshot }: { snapshot: OsSnapshot }) {
  if (!snapshot.ledgerError) return null;
  return (
    <NoticeCard
      title="The ledger could not be read"
      detail={snapshot.ledgerError}
    />
  );
}

function deltaTone(current: number, previous: number) {
  if (current > previous) return "positive" as const;
  if (current < previous) return "negative" as const;
  return "default" as const;
}

function vsLast(current: number, previous: number, lastMonth: string) {
  return `${formatSekDelta(current - previous)} vs ${formatMonthLabel(lastMonth)}`;
}

/** Revenue against expense over the trailing twelve months. */
function RevenueChart({ ledger, title = "Revenue vs expense" }: { ledger: LedgerSnapshot; title?: string }) {
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
function RunningResult({ ledger }: { ledger: LedgerSnapshot }) {
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
function ResultBars({ ledger }: { ledger: LedgerSnapshot }) {
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
function TaxPanel({
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

function CashAndProfitCharts({ ledger }: { ledger: LedgerSnapshot }) {
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

export function OverviewPage({
  snapshot,
  accessKey,
  todayYmd,
}: {
  snapshot: OsSnapshot;
  accessKey: string;
  todayYmd: string;
}) {
  const ledger = snapshot.ledger;
  const vault = osPath(accessKey, "vault");
  const tasksHref = osPath(accessKey, "tasks");

  return (
    <PageFrame>
      <PageTitle aside={`${snapshot.company.name} · ${snapshot.company.vat}`}>Overview</PageTitle>
      <LedgerProblem snapshot={snapshot} />

      {/* The list comes first: the point of opening the app is to see what to
          do next, not to admire the balance. */}
      <TaskList
        accessKey={accessKey}
        error={snapshot.tasksError}
        limit={6}
        moreHref={tasksHref}
        tasks={snapshot.tasks}
        title="Focus"
        todayYmd={todayYmd}
      />

      <TaskList
        accessKey={accessKey}
        addPlaceholder="Add a video idea…"
        emptyLabel="No video ideas yet. Add one when it comes to you."
        error={snapshot.tasksError}
        limit={5}
        list="video"
        moreHref={tasksHref}
        tasks={snapshot.tasks}
        title="Video ideas"
        todayYmd={todayYmd}
      />

      {ledger ? (
        <HeroStats
          items={[
            {
              label: "Cash 1930",
              value: formatSekTile(ledger.bankCents),
              hint: "Booked balance",
            },
            {
              label: `Result ${formatMonthLabel(ledger.month)}`,
              value: formatSekTile(ledger.profitMonthCents),
              hint: vsLast(ledger.profitMonthCents, ledger.profitLastMonthCents, ledger.lastMonth),
              tone: ledger.profitMonthCents < 0 ? "negative" : "default",
            },
            {
              label: `Revenue ${formatMonthLabel(ledger.month)}`,
              value: formatSekTile(ledger.incomeMonthCents),
              hint: vsLast(ledger.incomeMonthCents, ledger.incomeLastMonthCents, ledger.lastMonth),
              tone: deltaTone(ledger.incomeMonthCents, ledger.incomeLastMonthCents),
            },
            {
              label: `Bolagsskatt ${ledger.year}`,
              value: formatSekTile(ledger.corpTaxEstimateCents),
              hint: "20.6% of the result so far",
            },
          ]}
        />
      ) : null}

      {ledger ? <RunningResult ledger={ledger} /> : null}
      {ledger ? <TaxPanel ledger={ledger} upcoming={snapshot.upcoming} todayYmd={todayYmd} /> : null}

      {ledger ? (
        <KpiGrid>
          <KpiCard
            label="Expenses this month"
            value={formatSekTile(ledger.expenseMonthCents)}
            hint={vsLast(ledger.expenseMonthCents, ledger.expenseLastMonthCents, ledger.lastMonth)}
          />
          <KpiCard label={`Revenue ${ledger.year}`} value={formatSekTile(ledger.incomeYtdCents)} hint="Booked YTD" />
          <KpiCard label={`Expenses ${ledger.year}`} value={formatSekTile(ledger.expenseYtdCents)} hint="Booked YTD" />
          <KpiCard label={`Result ${ledger.year}`} value={formatSekTile(ledger.profitYtdCents)} hint="Before tax" />
        </KpiGrid>
      ) : null}

      {ledger ? (
        <Panel
          title="Latest entries"
          action={
            <Link className="text-xs font-semibold text-brand" href={routeHref(vault)}>
              Open Bokföring
            </Link>
          }
        >
          <EntryList entries={ledger.recent.slice(0, 8)} vaultBase={vault} />
        </Panel>
      ) : null}
    </PageFrame>
  );
}

export function TasksPage({
  snapshot,
  accessKey,
  todayYmd,
}: {
  snapshot: OsSnapshot;
  accessKey: string;
  todayYmd: string;
}) {
  // Archived tasks and video ideas are out of the to-do counts.
  const live = snapshot.tasks.filter((task) => !task.archivedAt && task.list === "task");
  const open = live.filter((task) => !task.done);
  const dueSoon = open.filter((task) => task.dueDate != null && task.dueDate <= todayYmd).length;

  return (
    <PageFrame>
      <PageTitle aside="Your list, plus everything the books say needs doing.">Tasks</PageTitle>

      <KpiGrid columns={3}>
        <KpiCard label="Open" value={formatNumber(open.length)} hint="Your list" />
        <KpiCard
          label="Due"
          value={formatNumber(dueSoon)}
          hint="Today or past"
          tone={dueSoon > 0 ? "negative" : "default"}
        />
        <KpiCard label="Flagged" value={formatNumber(snapshot.actions.length)} hint="From the books" />
      </KpiGrid>

      <div className="grid gap-2 lg:grid-cols-2">
        <TaskList
          accessKey={accessKey}
          error={snapshot.tasksError}
          tasks={snapshot.tasks}
          todayYmd={todayYmd}
        />
        <div className="flex flex-col gap-2">
          <TaskList
            accessKey={accessKey}
            addPlaceholder="Add a video idea…"
            emptyLabel="No video ideas yet. Add one when it comes to you."
            error={snapshot.tasksError}
            list="video"
            tasks={snapshot.tasks}
            title="Video ideas"
            todayYmd={todayYmd}
          />
          <ActionQueue actions={snapshot.actions} />
          <Panel title="Dates ahead">
            {snapshot.upcoming.length ? (
              snapshot.upcoming
                .slice(0, 10)
                .map((item) => (
                  <Row
                    key={item.id}
                    href={item.href ?? null}
                    primary={item.title}
                    secondary={item.detail}
                    value={formatDate(item.date)}
                    valueTone="muted"
                  />
                ))
            ) : (
              <EmptyState
                title="No dated items"
                detail="Tax dates and release dates appear here automatically."
              />
            )}
          </Panel>
        </div>
      </div>
    </PageFrame>
  );
}

export function MoneyPage({ snapshot, accessKey }: { snapshot: OsSnapshot; accessKey: string }) {
  const ledger = snapshot.ledger;
  const vault = osPath(accessKey, "vault");
  const wealth = snapshot.wealth;

  if (!ledger) {
    return (
      <PageFrame>
        <PageTitle>Money</PageTitle>
        <LedgerProblem snapshot={snapshot} />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <PageTitle aside={`Booked through ${formatDate(ledger.asOf)} · ${formatNumber(ledger.entryCount)} entries`}>
        Money
      </PageTitle>

      <HeroStats
        items={[
          { label: "Cash 1930", value: formatSekTile(ledger.bankCents), hint: "Booked company account" },
          { label: "KF 1385", value: formatSekTile(ledger.kfDepositedCents), hint: "Deposited book value" },
          { label: "Ledger assets", value: formatSekTile(ledger.ledgerAssetsCents), hint: "1930 + 1385" },
          {
            label: "Safe to spend",
            value: formatSekTile(ledger.cashAfterTaxCents),
            hint: "After VAT and corp tax",
            tone: ledger.cashAfterTaxCents < 0 ? "negative" : "default",
          },
        ]}
      />

      <RunningResult ledger={ledger} />
      <ResultBars ledger={ledger} />
      <RevenueChart ledger={ledger} title="Revenue and expenses, twelve months" />
      <CashAndProfitCharts ledger={ledger} />

      <SectionLabel>Where the money goes</SectionLabel>
      <KpiGrid>
        <KpiCard label="Software YTD" value={formatSekTile(ledger.softwareCents)} hint="Descriptions + konto 6540" />
        <KpiCard label="Hardware YTD" value={formatSekTile(ledger.hardwareCents)} hint="Descriptions + 12xx" />
        <KpiCard label="Ads YTD" value={formatSekTile(ledger.adsCents)} hint="Descriptions + 59xx" />
        <KpiCard label="Accounting YTD" value={formatSekTile(ledger.accountingCents)} hint="6530 / 6991" />
      </KpiGrid>

      <div className="grid gap-2 lg:grid-cols-2">
        <Panel title="Expense accounts this year">
          {ledger.categories.length ? (
            ledger.categories.map((row) => (
              <Row key={row.key} primary={row.label} secondary={`${row.count} entries`} value={formatSek(row.cents)} />
            ))
          ) : (
            <EmptyState title="No expense accounts" detail="Nothing booked to a cost account this year." />
          )}
        </Panel>
        <Panel title="Repeating costs" footer="Descriptions that appear in at least two different months.">
          {ledger.recurring.length ? (
            ledger.recurring.map((row) => (
              <Row
                key={row.label}
                primary={row.label}
                secondary={`${row.months} months · ${formatSek(row.totalCents)} total`}
                value={formatSek(row.lastCents)}
              />
            ))
          ) : (
            <EmptyState title="No repeating costs" detail="No description has repeated across months yet." />
          )}
        </Panel>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <Panel title="Largest expenses this year">
          <EntryList entries={ledger.largestExpenses} vaultBase={vault} emptyLabel="No expenses booked" />
        </Panel>
        <Panel
          title="Income by description"
          footer="There is no CRM. These are booked income entries grouped by their text."
        >
          {ledger.counterparties.length ? (
            ledger.counterparties.map((row) => (
              <Row
                key={row.name}
                primary={row.name}
                secondary={`${row.count} payments · last ${formatDate(row.lastDate)}`}
                value={formatSek(row.cents)}
                valueTone="positive"
              />
            ))
          ) : (
            <EmptyState title="No income booked" detail="Nothing has been booked as Inbetalning yet." />
          )}
        </Panel>
      </div>

      <SectionLabel>Tax</SectionLabel>
      <KpiGrid>
        <KpiCard
          label="VAT position"
          value={formatSekTile(ledger.vatPayableCents)}
          hint={ledger.vatPayableCents >= 0 ? "To pay" : "To reclaim"}
        />
        <KpiCard label="Corp tax estimate" value={formatSekTile(ledger.corpTaxEstimateCents)} hint="20.6% of YTD result" />
        <KpiCard label="After-tax result" value={formatSekTile(ledger.afterTaxYtdCents)} hint={`${ledger.year} YTD`} />
        <KpiCard
          label="Tax account 1630"
          value={ledger.taxAccountCents == null ? "—" : formatSekTile(ledger.taxAccountCents)}
          hint={ledger.taxAccountCents == null ? "Account never used" : "Booked balance"}
        />
        <KpiCard
          label="Employer fees 2730"
          value={ledger.employerCents == null ? "—" : formatSekTile(ledger.employerCents)}
          hint={ledger.employerCents == null ? "Account never used" : "Booked balance"}
        />
        <KpiCard
          label="Källskatt 2710"
          value={ledger.withholdingCents == null ? "—" : formatSekTile(ledger.withholdingCents)}
          hint={ledger.withholdingCents == null ? "Account never used" : "Booked balance"}
        />
      </KpiGrid>

      <Panel
        title="Receipts still missing"
        action={
          <Link className="text-xs font-semibold text-brand" href={routeHref(vault)}>
            Fix in Bokföring
          </Link>
        }
        footer="A booked expense without a document is the one thing an audit will ask about."
      >
        <EntryList
          entries={ledger.missingReceipts}
          vaultBase={vault}
          emptyLabel="Every expense has a receipt"
        />
      </Panel>

      <SectionLabel>Personal — outside the company books</SectionLabel>
      {wealth ? (
        <>
          <KpiGrid columns={3}>
            <KpiCard label="Capital" value={formatSekTile(wealth.capitalCents)} hint="Trading desk" />
            <KpiCard
              label="Open P&L"
              value={wealth.openPnlCents == null ? "—" : formatSekTile(wealth.openPnlCents)}
              hint="Unrealised"
              tone={wealth.openPnlCents != null && wealth.openPnlCents < 0 ? "negative" : "positive"}
            />
            <KpiCard label="Positions" value={formatNumber(wealth.positions.length)} hint="Held now" />
          </KpiGrid>
          <Panel title="Positions" footer={wealth.disclaimer}>
            {wealth.positions.length ? (
              wealth.positions.map((position) => (
                <Row
                  key={position.symbol}
                  primary={position.symbol}
                  secondary={position.name}
                  value={formatPercent((position.pnlPct ?? 0) / 100)}
                  valueTone={(position.pnlPct ?? 0) < 0 ? "negative" : "positive"}
                />
              ))
            ) : (
              <EmptyState title="No open positions" detail="The trading book is flat." />
            )}
          </Panel>
        </>
      ) : (
        <NoticeCard
          tone="muted"
          title="Trading book unavailable"
          detail="The personal trading desk book could not be read. Company figures above are unaffected."
        />
      )}

      <ConnectFootnote sources={snapshot.sources.filter((source) => source.id === "bank" || source.id === "avanza")} />
    </PageFrame>
  );
}

export function MusicPage({ snapshot, todayYmd }: { snapshot: OsSnapshot; todayYmd: string }) {
  return (
    <MusicDashboard
      followers={snapshot.spotify?.followers ?? null}
      releases={snapshot.releases}
      sources={snapshot.sources}
      todayYmd={todayYmd}
    />
  );
}

export function SettingsPage({
  snapshot,
  accessKey,
}: {
  snapshot: OsSnapshot;
  accessKey: string;
}) {
  return (
    <PageFrame>
      <PageTitle aside="Appearance, company details and data sources.">Settings</PageTitle>
      <AppearanceSettings />

      <Panel title="Company">
        <Row primary="Name" value={snapshot.company.name} valueTone="muted" />
        <Row primary="VAT number" value={snapshot.company.vat} valueTone="muted" />
        <Row primary="Owner" value={snapshot.company.owner} valueTone="muted" />
      </Panel>

      <Panel title="Data sources" footer="Unconnected sources simply do not appear anywhere in the dashboard.">
        {snapshot.sources.map((source) => (
          <Row
            key={source.id}
            primary={source.label}
            secondary={source.detail}
            badge={source.wired ? <Pill tone="brand">Connected</Pill> : <Pill>Not connected</Pill>}
          />
        ))}
      </Panel>

      <SignOutRow accessKey={accessKey} />
    </PageFrame>
  );
}
