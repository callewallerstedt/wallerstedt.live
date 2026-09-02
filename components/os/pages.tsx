import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";

import {
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
import type { LedgerSnapshot, OsSnapshot, SpotifyHistory } from "@/lib/os/types";
import { DualTrendChart } from "@/components/os/charts";
import { ActionQueue, TaskList } from "@/components/os/tasks";
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

function CashAndProfitCharts({ ledger }: { ledger: LedgerSnapshot }) {
  const labels = ledger.months.map((row) => formatMonthLabel(row.month));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
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

      {ledger ? (
        <HeroStats
          items={[
            {
              label: "Safe to spend",
              value: formatSekTile(ledger.cashAfterTaxCents),
              hint: "Cash 1930 after VAT and 20.6% corp tax",
              tone: ledger.cashAfterTaxCents < 0 ? "negative" : "default",
            },
            {
              label: "Cash 1930",
              value: formatSekTile(ledger.bankCents),
              hint: "Booked balance, not a live bank feed",
            },
            {
              label: `Revenue ${formatMonthLabel(ledger.month)}`,
              value: formatSekTile(ledger.incomeMonthCents),
              hint: vsLast(ledger.incomeMonthCents, ledger.incomeLastMonthCents, ledger.lastMonth),
              tone: deltaTone(ledger.incomeMonthCents, ledger.incomeLastMonthCents),
            },
            {
              label: `Result ${formatMonthLabel(ledger.month)}`,
              value: formatSekTile(ledger.profitMonthCents),
              hint: vsLast(ledger.profitMonthCents, ledger.profitLastMonthCents, ledger.lastMonth),
              tone: ledger.profitMonthCents < 0 ? "negative" : "default",
            },
          ]}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <TaskList
          accessKey={accessKey}
          error={snapshot.tasksError}
          limit={6}
          moreHref={tasksHref}
          tasks={snapshot.tasks}
          todayYmd={todayYmd}
        />
        <ActionQueue actions={snapshot.actions} limit={6} />
      </div>

      {ledger ? <RevenueChart ledger={ledger} /> : null}

      {ledger ? (
        <KpiGrid>
          <KpiCard
            label="Expenses this month"
            value={formatSekTile(ledger.expenseMonthCents)}
            hint={vsLast(ledger.expenseMonthCents, ledger.expenseLastMonthCents, ledger.lastMonth)}
          />
          <KpiCard label={`Revenue ${ledger.year}`} value={formatSekTile(ledger.incomeYtdCents)} hint="Booked YTD" />
          <KpiCard label={`Result ${ledger.year}`} value={formatSekTile(ledger.profitYtdCents)} hint="Booked YTD" />
          <KpiCard
            label="VAT position"
            value={formatSekTile(ledger.vatPayableCents)}
            hint={ledger.vatPayableCents >= 0 ? "To pay Skatteverket" : "To reclaim"}
          />
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
  const open = snapshot.tasks.filter((task) => !task.done);
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

      <div className="grid gap-3 lg:grid-cols-2">
        <TaskList
          accessKey={accessKey}
          error={snapshot.tasksError}
          tasks={snapshot.tasks}
          todayYmd={todayYmd}
        />
        <div className="flex flex-col gap-3">
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

      <RevenueChart ledger={ledger} title="Twelve months" />
      <CashAndProfitCharts ledger={ledger} />

      <SectionLabel>Where the money goes</SectionLabel>
      <KpiGrid>
        <KpiCard label="Software YTD" value={formatSekTile(ledger.softwareCents)} hint="Descriptions + konto 6540" />
        <KpiCard label="Hardware YTD" value={formatSekTile(ledger.hardwareCents)} hint="Descriptions + 12xx" />
        <KpiCard label="Ads YTD" value={formatSekTile(ledger.adsCents)} hint="Descriptions + 59xx" />
        <KpiCard label="Accounting YTD" value={formatSekTile(ledger.accountingCents)} hint="6530 / 6991" />
      </KpiGrid>

      <div className="grid gap-3 lg:grid-cols-2">
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

      <div className="grid gap-3 lg:grid-cols-2">
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

function SpotifyPanel({ history, followers }: { history: SpotifyHistory; followers: number | null }) {
  const dailyLabels = history.daily.map((row, index) => {
    if (index === 0 || index === history.daily.length - 1 || row.date.endsWith("-01")) {
      return formatMonthLabel(row.date.slice(0, 7));
    }
    return "";
  });

  return (
    <>
      <NoticeCard
        tone="muted"
        title={`Snapshot from ${formatDate(history.scrapedAt)} — not live`}
        detail={`Spotify for Artists export covering ${formatDate(history.from)} to ${formatDate(history.to)}. Numbers only move when the export is refreshed.`}
      />

      <KpiGrid>
        <KpiCard label="Own streams" value={formatCompactCount(history.ownStreams)} hint={history.throughLabel} />
        <KpiCard
          label="Best recorded day"
          value={formatNumber(history.lastCompleteOwn)}
          hint={formatDate(history.lastCompleteDay)}
        />
        <KpiCard
          label="Estimated earnings"
          value={formatUsd(history.estimatedOwnEarningsUsd)}
          hint={`Own streams × $${history.ratePerStreamUsd}`}
        />
        <KpiCard
          label="DistroKid Spotify"
          value={formatUsd(history.distrokid.spotifyEarnUsd)}
          hint={`${formatCompactCount(history.distrokid.spotifyQty)} streams · not in bokföring`}
        />
        {followers != null ? (
          <KpiCard label="Followers" value={formatNumber(followers)} hint="Live from the public artist API" />
        ) : (
          <KpiCard label="Label catalog" value={formatCompactCount(history.labelStreams)} hint="Same export window" />
        )}
        <KpiCard
          label="Memories"
          value={formatCompactCount(history.memories.streams)}
          hint={`Peak ${formatNumber(history.memories.firstDayStreams)}/day`}
        />
      </KpiGrid>

      <Panel
        title="Daily streams"
        action={
          <span className="flex gap-3 text-xs">
            <span className="text-brand">Own {formatCompactCount(history.ownStreams)}</span>
            <span className="text-muted-foreground">Label {formatCompactCount(history.labelStreams)}</span>
          </span>
        }
      >
        <DualTrendChart
          unit="count"
          labels={dailyLabels}
          series={[
            { key: "own", label: "Own", values: history.daily.map((row) => row.own), fill: true },
            { key: "label", label: "Label", values: history.daily.map((row) => row.label), tone: "muted" },
          ]}
        />
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Top tracks">
          {history.top.slice(0, 8).map((song) => (
            <Row
              key={song.id}
              primary={song.name}
              secondary={`${song.category} · ${formatNumber(song.avgDaily)}/day average`}
              value={formatCompactCount(song.streams)}
            />
          ))}
        </Panel>
        <Panel title="DistroKid by store" footer={`Payout mix scraped ${formatDate(history.distrokid.scrapedAt)}.`}>
          {history.distrokid.stores.slice(0, 8).map((store) => (
            <Row
              key={store.store}
              primary={store.store}
              secondary={`${formatCompactCount(store.qty)} streams`}
              value={formatUsd(store.earnUsd)}
            />
          ))}
        </Panel>
      </div>
    </>
  );
}

export function MusicPage({ snapshot, todayYmd }: { snapshot: OsSnapshot; todayYmd: string }) {
  const upcoming = snapshot.releases.filter((row) => row.upcoming);
  const released = snapshot.releases.filter((row) => !row.upcoming).slice(-12).reverse();

  return (
    <PageFrame>
      <PageTitle aside="Streaming and catalog. None of this is booked revenue.">Music</PageTitle>
      <SpotifyPanel history={snapshot.spotifyHistory} followers={snapshot.spotify?.followers ?? null} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Coming up">
          {upcoming.length ? (
            upcoming.map((row) => (
              <Row
                key={`${row.slug}-${row.date}`}
                href={row.spotifyUrl}
                external={Boolean(row.spotifyUrl)}
                primary={row.title}
                secondary={row.date >= todayYmd ? "Scheduled" : undefined}
                value={formatDate(row.date)}
                valueTone="muted"
              />
            ))
          ) : (
            <EmptyState title="Nothing scheduled" detail="No future release dates in the public catalog." />
          )}
        </Panel>
        <Panel title="Recently released">
          {released.map((row) => (
            <Row
              key={`${row.slug}-${row.date}`}
              href={row.spotifyUrl}
              external={Boolean(row.spotifyUrl)}
              primary={row.title}
              value={formatDate(row.date)}
              valueTone="muted"
            />
          ))}
        </Panel>
      </div>

      <ConnectFootnote
        sources={snapshot.sources.filter((source) => source.id === "tiktok" || source.id === "spotify")}
      />
    </PageFrame>
  );
}

export function ProjectsPage({ snapshot }: { snapshot: OsSnapshot }) {
  const projects = snapshot.projects;
  const withRevenue = projects.filter((project) => project.revenueCents);

  return (
    <PageFrame>
      <PageTitle aside="Public GitHub repositories, matched against the ledger where the names line up.">
        Projects
      </PageTitle>

      {snapshot.projectsError ? (
        <NoticeCard title="GitHub could not be reached" detail={snapshot.projectsError} />
      ) : null}

      <KpiGrid columns={3}>
        <KpiCard label="Repos" value={formatNumber(projects.length)} hint="Public" />
        <KpiCard label="Earning" value={formatNumber(withRevenue.length)} hint="Matched ledger" />
        <KpiCard
          label="Active"
          value={formatNumber(
            projects.filter(
              (project) =>
                (project.lastActivity ?? "").slice(0, 7) === new Date().toISOString().slice(0, 7),
            ).length,
          )}
          hint="This month"
        />
      </KpiGrid>

      <Panel title="Repositories">
        {projects.length ? (
          projects.map((project) => (
            <Row
              key={project.repo ?? project.name}
              external
              href={project.repoUrl}
              primary={project.name}
              secondary={[project.status, project.lastActivity?.slice(0, 10)].filter(Boolean).join(" · ")}
              badge={project.revenueCents ? <Pill tone="brand">{formatSekTile(project.revenueCents)}</Pill> : undefined}
              value={project.repoUrl ? <ArrowUpRightIcon className="size-4 text-muted-foreground" /> : undefined}
            />
          ))
        ) : (
          <EmptyState
            title="No repositories"
            detail="GitHub returned no public repositories for this account."
          />
        )}
      </Panel>

      <ConnectFootnote sources={snapshot.sources.filter((source) => source.id === "vercel")} />
    </PageFrame>
  );
}
