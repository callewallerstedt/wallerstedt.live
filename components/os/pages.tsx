import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";

import {
  formatCompactCount,
  formatDate,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  formatSek,
  formatSekTile,
  formatUsd,
  formatVsLast,
} from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import type { LedgerSnapshot, OsSnapshot, SpotifyHistory } from "@/lib/os/types";
import { DualTrendChart } from "@/components/os/charts";
import {
  ConnectFootnote,
  EmptyCard,
  EntryList,
  KpiCard,
  KpiGrid,
  MoneyStrip,
  PageFrame,
  PageTitle,
} from "@/components/os/ui";

function ledgerErrorCard(snapshot: OsSnapshot) {
  if (!snapshot.ledgerError) return null;
  return <EmptyCard title="Ledger" detail={snapshot.ledgerError} />;
}

function CompactTrend({
  ledger,
  title = "Revenue vs expense",
}: {
  ledger: LedgerSnapshot;
  title?: string;
}) {
  if (!ledger.months.some((row) => row.incomeCents || row.expenseCents)) return null;
  const labels = ledger.months.map((row) => formatMonthLabel(row.month));
  return (
    <section className="overflow-hidden rounded-md bg-card ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-2 px-2 pt-1">
        <p className="text-[10px] font-medium text-muted-foreground">{title}</p>
        <p className="flex gap-2 text-[10px] text-muted-foreground">
          <span className="text-brand">Rev {formatSekTile(ledger.incomeYtdCents)}</span>
          <span>Exp {formatSekTile(ledger.expenseYtdCents)}</span>
        </p>
      </div>
      <DualTrendChart
        labels={labels}
        series={[
          { key: "rev", label: "Revenue", values: ledger.months.map((row) => row.incomeCents), fill: true },
          { key: "exp", label: "Expense", values: ledger.months.map((row) => row.expenseCents), tone: "muted" },
        ]}
      />
    </section>
  );
}

function MiniCharts({ ledger }: { ledger: LedgerSnapshot }) {
  const labels = ledger.months.map((row) => formatMonthLabel(row.month));
  return (
    <div className="grid grid-cols-2 gap-1">
      <section className="overflow-hidden rounded-md bg-card ring-1 ring-foreground/10">
        <div className="flex items-baseline justify-between px-2 pt-1">
          <p className="text-[10px] font-medium text-muted-foreground">Cash 1930</p>
          <p className="text-[11px] font-semibold tabular-nums">{formatSekTile(ledger.bankCents)}</p>
        </div>
        <DualTrendChart
          compact
          labels={labels}
          series={[{ key: "bank", label: "Cash 1930", values: ledger.months.map((row) => row.bankCents), fill: true }]}
        />
      </section>
      <section className="overflow-hidden rounded-md bg-card ring-1 ring-foreground/10">
        <div className="flex items-baseline justify-between px-2 pt-1">
          <p className="text-[10px] font-medium text-muted-foreground">Profit 12m</p>
          <p className="text-[11px] font-semibold tabular-nums">{formatSekTile(ledger.profitYtdCents)}</p>
        </div>
        <DualTrendChart
          compact
          labels={labels}
          series={[{ key: "profit", label: "Profit", values: ledger.months.map((row) => row.resultCents), fill: true }]}
        />
      </section>
    </div>
  );
}

function SpotifyBlock({ history, followers }: { history: SpotifyHistory; followers: number | null }) {
  const dailyLabels = history.daily.map((row, index) => {
    if (index === 0 || index === history.daily.length - 1 || row.date.endsWith("-01")) {
      return formatMonthLabel(row.date.slice(0, 7));
    }
    return "";
  });
  return (
    <section className="overflow-hidden rounded-md bg-card ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-2 px-2 py-1">
        <p className="text-[10px] font-medium text-muted-foreground">Spotify for Artists</p>
        <p className="text-[10px] text-muted-foreground">{history.throughLabel} · scrape {formatDate(history.scrapedAt)}</p>
      </div>
      <div className="px-1 pb-1">
        <KpiGrid>
          <KpiCard
            label="Own Total"
            value={formatCompactCount(history.ownStreams)}
            hint={`${formatDate(history.from)}–${formatDate(history.to)}`}
          />
          <KpiCard
            label="Last day own"
            value={formatNumber(history.lastCompleteOwn)}
            hint={formatDate(history.lastCompleteDay)}
          />
          <KpiCard
            label="S4A-era est."
            value={formatUsd(history.estimatedOwnEarningsUsd)}
            hint={`Own × $${history.ratePerStreamUsd} from summary`}
          />
          <KpiCard
            label="DK Spotify"
            value={formatUsd(history.distrokid.spotifyEarnUsd)}
            hint={`${formatCompactCount(history.distrokid.spotifyQty)} qty · not bokföring`}
          />
          <KpiCard
            label="Memories"
            value={formatNumber(history.memories.firstDayStreams)}
            hint={`per day on ${formatDate(history.memories.from)} · ${formatCompactCount(history.memories.streams)} yr`}
          />
          {followers != null ? (
            <KpiCard label="Followers" value={formatNumber(followers)} hint="Public artist API" />
          ) : (
            <KpiCard
              label="Label catalog"
              value={formatCompactCount(history.labelStreams)}
              hint="Same scrape window"
            />
          )}
        </KpiGrid>
      </div>
      <div className="flex items-baseline justify-between px-2">
        <p className="text-[10px] font-medium text-muted-foreground">Daily Own Total</p>
        <p className="flex gap-2 text-[10px] text-muted-foreground">
          <span className="text-brand">Own {formatCompactCount(history.ownStreams)}</span>
          <span>Label {formatCompactCount(history.labelStreams)}</span>
        </p>
      </div>
      <DualTrendChart
        unit="count"
        labels={dailyLabels}
        series={[
          { key: "own", label: "Own Total", values: history.daily.map((row) => row.own), fill: true },
          { key: "label", label: "Label Total", values: history.daily.map((row) => row.label), tone: "muted" },
        ]}
      />
      <ul>
        {history.top.slice(0, 6).map((song) => (
          <li key={song.id} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
            <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{song.name}</p>
            <p className="text-[10px] text-muted-foreground">{song.category}</p>
            <p className="text-[13px] font-semibold tabular-nums">{formatCompactCount(song.streams)}</p>
          </li>
        ))}
      </ul>
      <p className="px-2 py-1 text-[10px] leading-snug text-muted-foreground">
        DistroKid mix {formatDate(history.distrokid.scrapedAt)}:{" "}
        {history.distrokid.stores
          .slice(0, 5)
          .map((store) => `${store.store} ${formatUsd(store.earnUsd)}`)
          .join(" · ")}
        . Callespc CSV Own Total {formatNumber(history.csvVerified.ownTotal)} over {history.csvVerified.days}d
        (last day {formatNumber(history.csvVerified.ownLastDay)}) matches the 15 Apr 00:08 backup — not live.
      </p>
    </section>
  );
}

function TightSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md bg-card ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-2 px-2 py-1">
        <p className="text-[10px] font-medium text-muted-foreground">{title}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

export function OverviewPage({ snapshot, accessKey }: { snapshot: OsSnapshot; accessKey: string }) {
  const ledger = snapshot.ledger;
  const vault = osPath(accessKey, "vault");
  const extra: Array<{ label: string; value: string; hint?: string }> = [];

  if (ledger) {
    extra.push(
      {
        label: "Expenses",
        value: formatSekTile(ledger.expenseMonthCents),
        hint: formatVsLast(ledger.expenseMonthCents, ledger.expenseLastMonthCents, ledger.lastMonth),
      },
      {
        label: "VAT",
        value: formatSekTile(ledger.vatPayableCents),
        hint: "Income − expense VAT",
      },
      {
        label: "Cash 1930",
        value: formatSekTile(ledger.bankCents),
        hint: "Booked, not live bank",
      },
    );
    if (ledger.kfDepositedCents) {
      extra.push({
        label: "KF 1385",
        value: formatSekTile(ledger.kfDepositedCents),
        hint: "Deposited book value",
      });
    }
    extra.push(
      { label: "Income YTD", value: formatSekTile(ledger.incomeYtdCents), hint: ledger.year },
      { label: "Expenses YTD", value: formatSekTile(ledger.expenseYtdCents), hint: ledger.year },
      {
        label: "Profit month",
        value: formatSekTile(ledger.profitMonthCents),
        hint: formatVsLast(ledger.profitMonthCents, ledger.profitLastMonthCents, ledger.lastMonth),
      },
    );
    if (ledger.missingReceiptCount) {
      extra.push({
        label: "Receipts",
        value: formatNumber(ledger.missingReceiptCount),
        hint: "Missing documents",
      });
    }
    if (ledger.pendingDraftCount) {
      extra.push({
        label: "Drafts",
        value: formatNumber(ledger.pendingDraftCount),
        hint: "Unapproved in vault",
      });
    }
  }

  return (
    <PageFrame>
      <PageTitle aside={`${snapshot.company.name} · ${snapshot.company.vat}`}>Overview</PageTitle>
      {ledgerErrorCard(snapshot)}
      {ledger ? (
        <MoneyStrip
          items={[
            { label: "Value", value: formatSekTile(ledger.ledgerAssetsCents), hint: "1930 + 1385" },
            {
              label: "This month",
              value: formatSekTile(ledger.incomeMonthCents),
              hint: formatVsLast(ledger.incomeMonthCents, ledger.incomeLastMonthCents, ledger.lastMonth),
            },
            { label: "YTD profit", value: formatSekTile(ledger.profitYtdCents), hint: "Booked, not annualized" },
            { label: "After tax", value: formatSekTile(ledger.cashAfterTaxCents), hint: "1930 − VAT − 20.6%" },
          ]}
        />
      ) : null}
      {ledger ? <CompactTrend ledger={ledger} /> : null}
      {ledger ? <MiniCharts ledger={ledger} /> : null}
      {extra.length ? (
        <KpiGrid>
          {extra.map((tile) => (
            <KpiCard key={tile.label} {...tile} />
          ))}
        </KpiGrid>
      ) : null}
      {ledger ? (
        <TightSection
          title="Ledger"
          action={
            <Link href={routeHref(vault)} className="text-[11px] font-semibold text-brand">
              Vault
            </Link>
          }
        >
          <EntryList entries={ledger.recent} vaultBase={vault} />
        </TightSection>
      ) : (
        <p className="text-xs text-muted-foreground">No ledger.</p>
      )}
      {snapshot.alerts.length ? (
        <TightSection title="Alerts">
          {snapshot.alerts.slice(0, 8).map((alert) => (
            <div key={alert.id} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{alert.title}</p>
              {alert.href ? (
                <Link href={routeHref(alert.href)} className="text-[11px] font-semibold text-brand">
                  Open
                </Link>
              ) : null}
            </div>
          ))}
        </TightSection>
      ) : null}
      {snapshot.projects.length ? (
        <TightSection title="GitHub">
          {snapshot.projects.slice(0, 5).map((project) => (
            <div key={project.repo ?? project.name} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{project.name}</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">
                {project.lastActivity?.slice(0, 10) ?? "—"}
              </p>
              {project.repoUrl ? (
                <Link href={routeHref(project.repoUrl)} className="text-muted-foreground">
                  <ArrowUpRightIcon className="size-3.5" />
                </Link>
              ) : null}
            </div>
          ))}
        </TightSection>
      ) : null}
      <SpotifyBlock history={snapshot.spotifyHistory} followers={snapshot.spotify?.followers ?? null} />
      <ConnectFootnote
        sources={snapshot.sources.filter((source) => source.id !== "spotify" && source.id !== "distrokid" && source.id !== "github" && source.id !== "ledger")}
      />
    </PageFrame>
  );
}

export function MoneyPage({ snapshot, accessKey }: { snapshot: OsSnapshot; accessKey: string }) {
  const ledger = snapshot.ledger;
  const vault = osPath(accessKey, "vault");
  if (!ledger) {
    return (
      <PageFrame>
        <PageTitle>Money</PageTitle>
        {ledgerErrorCard(snapshot)}
      </PageFrame>
    );
  }
  return (
    <PageFrame>
      <PageTitle>Money</PageTitle>
      <KpiGrid>
        <KpiCard label="Bank 1930" value={formatSekTile(ledger.bankCents)} hint="Booked, not live bank" />
        <KpiCard label="KF 1385" value={formatSekTile(ledger.kfDepositedCents)} hint="Deposited book value" />
        <KpiCard label="Ledger assets" value={formatSekTile(ledger.ledgerAssetsCents)} />
        <KpiCard label="Safe to spend" value={formatSekTile(ledger.cashAfterTaxCents)} hint="Estimate from books" />
        <KpiCard
          label="Revenue month"
          value={formatSekTile(ledger.incomeMonthCents)}
          hint={formatVsLast(ledger.incomeMonthCents, ledger.incomeLastMonthCents, ledger.lastMonth)}
        />
        <KpiCard label="Revenue YTD" value={formatSekTile(ledger.incomeYtdCents)} />
        <KpiCard
          label="Expenses month"
          value={formatSekTile(ledger.expenseMonthCents)}
          hint={formatVsLast(ledger.expenseMonthCents, ledger.expenseLastMonthCents, ledger.lastMonth)}
        />
        <KpiCard label="Profit YTD" value={formatSekTile(ledger.profitYtdCents)} />
        <KpiCard label="Software YTD" value={formatSekTile(ledger.softwareCents)} hint="From descriptions + 6540" />
        <KpiCard label="Hardware YTD" value={formatSekTile(ledger.hardwareCents)} />
        <KpiCard label="Ads YTD" value={formatSekTile(ledger.adsCents)} />
        <KpiCard label="Accounting YTD" value={formatSekTile(ledger.accountingCents)} />
      </KpiGrid>
      <CompactTrend ledger={ledger} title="12-month revenue" />
      <TightSection title="Recent">
        <EntryList entries={ledger.recent} vaultBase={vault} />
      </TightSection>
      <TightSection title="Largest expenses">
        <EntryList entries={ledger.largestExpenses} vaultBase={vault} />
      </TightSection>
      <TightSection title="Categories">
        {ledger.categories.map((row) => (
          <div key={row.key} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
            <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{row.label}</p>
            <p className="text-[13px] font-semibold tabular-nums">{formatSek(row.cents)}</p>
          </div>
        ))}
      </TightSection>
      <TightSection title="Recurring">
        {ledger.recurring.length ? (
          ledger.recurring.map((row) => (
            <div key={row.label} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{row.label}</p>
              <p className="text-[10px] text-muted-foreground">{row.months}m</p>
              <p className="text-[13px] font-semibold tabular-nums">{formatSek(row.lastCents)}</p>
            </div>
          ))
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">No repeating descriptions yet.</p>
        )}
      </TightSection>
      <TightSection
        title="Receipts missing"
        action={
          <Link href={routeHref(vault)} className="text-[11px] font-semibold text-brand">
            Vault
          </Link>
        }
      >
        <EntryList entries={ledger.missingReceipts} vaultBase={vault} />
      </TightSection>
      <ConnectFootnote sources={snapshot.sources.filter((source) => source.id === "bank")} />
    </PageFrame>
  );
}

export function MusicPage({ snapshot }: { snapshot: OsSnapshot }) {
  return (
    <PageFrame>
      <PageTitle>Music</PageTitle>
      <SpotifyBlock history={snapshot.spotifyHistory} followers={snapshot.spotify?.followers ?? null} />
      <TightSection title="Release calendar">
        <ul>
          {snapshot.releases.map((row) => (
            <li key={`${row.slug}-${row.date}`} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{row.title}</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">{formatDate(row.date)}</p>
              {row.spotifyUrl ? (
                <Link href={routeHref(row.spotifyUrl)} className="text-[11px] font-semibold text-brand">
                  Spotify
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </TightSection>
    </PageFrame>
  );
}

export function ContentPage({ snapshot }: { snapshot: OsSnapshot }) {
  return (
    <PageFrame>
      <PageTitle>Content</PageTitle>
      <ConnectFootnote
        sources={snapshot.sources.filter((source) => source.id === "tiktok" || source.id === "spotify")}
      />
    </PageFrame>
  );
}

export function ProjectsPage({ snapshot }: { snapshot: OsSnapshot }) {
  return (
    <PageFrame>
      <PageTitle>Projects</PageTitle>
      {snapshot.projectsError ? <EmptyCard title="GitHub" detail={snapshot.projectsError} /> : null}
      {!snapshot.projects.length && !snapshot.projectsError ? (
        <p className="text-xs text-muted-foreground">No public repos returned.</p>
      ) : null}
      {snapshot.projects.length ? (
        <TightSection title="Public repos">
          {snapshot.projects.map((project) => (
            <div key={project.repo ?? project.name} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{project.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {project.status}
                  {project.lastActivity ? ` · ${project.lastActivity.slice(0, 10)}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-[10px] text-muted-foreground">
                {project.revenueCents == null ? "" : formatSekTile(project.revenueCents)}
              </p>
              {project.repoUrl ? (
                <Link href={routeHref(project.repoUrl)} className="text-muted-foreground">
                  <ArrowUpRightIcon className="size-3.5" />
                </Link>
              ) : null}
            </div>
          ))}
        </TightSection>
      ) : null}
    </PageFrame>
  );
}

export function CustomersPage({ snapshot, accessKey }: { snapshot: OsSnapshot; accessKey: string }) {
  const ledger = snapshot.ledger;
  return (
    <PageFrame>
      <PageTitle>Work</PageTitle>
      <KpiGrid>
        <KpiCard
          label="Paid"
          value={formatNumber(ledger?.counterparties.length ?? 0)}
          hint="From income descriptions"
        />
        {ledger ? (
          <KpiCard label="Income YTD" value={formatSekTile(ledger.incomeYtdCents)} hint="Booked ledger" />
        ) : null}
      </KpiGrid>
      <TightSection title="Revenue per description">
        {ledger?.counterparties.length ? (
          ledger.counterparties.map((row) => (
            <div key={row.name} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{row.name}</p>
              <p className="text-[10px] text-muted-foreground">{formatDate(row.lastDate)}</p>
              <p className="text-[13px] font-semibold tabular-nums">{formatSek(row.cents)}</p>
            </div>
          ))
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">No income posts.</p>
        )}
      </TightSection>
      <p className="text-[11px] text-muted-foreground">No CRM. Ledger income only.</p>
      <Link href={routeHref(osPath(accessKey, "accounting"))} className="text-[11px] font-semibold text-brand">
        Tax
      </Link>
    </PageFrame>
  );
}

export function AccountingPage({ snapshot, accessKey }: { snapshot: OsSnapshot; accessKey: string }) {
  const ledger = snapshot.ledger;
  const vault = osPath(accessKey, "vault");
  return (
    <PageFrame>
      <PageTitle aside="Official books. Edit under Bokföring.">Tax</PageTitle>
      <KpiGrid>
        <KpiCard
          label="VAT payable"
          value={ledger ? formatSekTile(ledger.vatPayableCents) : "—"}
          hint="Income VAT − expense VAT"
        />
        <KpiCard
          label="Employer"
          value={ledger?.employerCents == null ? "—" : formatSekTile(ledger.employerCents)}
          hint={ledger?.employerCents == null ? "Konto 2730 unused" : "Konto 2730"}
        />
        <KpiCard
          label="Källskatt"
          value={ledger?.withholdingCents == null ? "—" : formatSekTile(ledger.withholdingCents)}
          hint={ledger?.withholdingCents == null ? "Konto 2710 unused" : "Employee withholding · 2710"}
        />
        <KpiCard
          label="Corp tax"
          value={ledger ? formatSekTile(ledger.corpTaxEstimateCents) : "—"}
          hint="20.6% of booked YTD"
        />
        <KpiCard
          label="Tax account"
          value={ledger?.taxAccountCents == null ? "—" : formatSekTile(ledger.taxAccountCents)}
          hint={ledger?.taxAccountCents == null ? "Konto 1630 unused" : "Konto 1630"}
        />
        <KpiCard label="Revenue YTD" value={ledger ? formatSekTile(ledger.incomeYtdCents) : "—"} />
        <KpiCard label="Expenses YTD" value={ledger ? formatSekTile(ledger.expenseYtdCents) : "—"} />
        <KpiCard
          label="After-tax YTD"
          value={ledger ? formatSekTile(ledger.afterTaxYtdCents) : "—"}
          hint="Booked YTD − 20.6%"
        />
      </KpiGrid>
      <TightSection
        title="Receipts missing"
        action={
          <Link href={routeHref(vault)} className="text-[11px] font-semibold text-brand">
            Edit in Bokföring
          </Link>
        }
      >
        {ledger ? <EntryList entries={ledger.missingReceipts} vaultBase={vault} /> : null}
      </TightSection>
      {ledgerErrorCard(snapshot)}
    </PageFrame>
  );
}

export function InvestmentsPage({ snapshot }: { snapshot: OsSnapshot }) {
  const ledger = snapshot.ledger;
  return (
    <PageFrame>
      <PageTitle>Invest</PageTitle>
      <KpiGrid>
        {ledger ? (
          <KpiCard label="KF deposited" value={formatSekTile(ledger.kfDepositedCents)} hint="Konto 1385" />
        ) : null}
        {ledger ? (
          <KpiCard label="Cash 1930" value={formatSekTile(ledger.bankCents)} hint="Booked bank" />
        ) : null}
      </KpiGrid>
      <ConnectFootnote sources={snapshot.sources.filter((source) => source.id === "avanza")} />
    </PageFrame>
  );
}

export function WealthPage({ snapshot }: { snapshot: OsSnapshot }) {
  const ledger = snapshot.ledger;
  const wealth = snapshot.wealth;
  return (
    <PageFrame>
      <PageTitle aside="Personal figures stay off the official books.">Wealth</PageTitle>
      <KpiGrid>
        <KpiCard label="Company cash" value={ledger ? formatSekTile(ledger.bankCents) : "—"} hint="1930 booked" />
        <KpiCard
          label="Company KF"
          value={ledger ? formatSekTile(ledger.kfDepositedCents) : "—"}
          hint="1385 booked"
        />
        {wealth ? (
          <KpiCard
            label="Trading capital"
            value={formatSekTile(wealth.capitalCents)}
            hint={wealth.source}
          />
        ) : null}
        {wealth?.openPnlCents != null ? (
          <KpiCard label="Open P&L" value={formatSekTile(wealth.openPnlCents)} hint="Trading desk" />
        ) : null}
      </KpiGrid>
      {wealth ? (
        <TightSection title="Personal positions">
          {wealth.positions.map((position) => (
            <div key={position.symbol} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{position.symbol}</p>
              <p className="text-[10px] text-muted-foreground">{position.name}</p>
              <p className="text-[13px] tabular-nums">{formatPercent((position.pnlPct ?? 0) / 100)}</p>
            </div>
          ))}
          <p className="px-2 py-1 text-[10px] text-muted-foreground">{wealth.disclaimer}</p>
        </TightSection>
      ) : (
        <p className="text-xs text-muted-foreground">Trading book could not be read.</p>
      )}
    </PageFrame>
  );
}

export function UpcomingPage({ snapshot }: { snapshot: OsSnapshot }) {
  return (
    <PageFrame>
      <PageTitle>Upcoming</PageTitle>
      <TightSection title="Dates">
        {snapshot.upcoming.length ? (
          snapshot.upcoming.map((item) => (
            <div key={item.id} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">{item.detail}</p>
              <p className="text-[11px] tabular-nums text-muted-foreground">{formatDate(item.date)}</p>
            </div>
          ))
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">No dated items from wired sources.</p>
        )}
      </TightSection>
      <p className="text-[11px] text-muted-foreground">
        No calendar or vendor billing API. Recurring ledger rows live under Money.
      </p>
    </PageFrame>
  );
}

export function AlertsPage({ snapshot }: { snapshot: OsSnapshot }) {
  return (
    <PageFrame>
      <PageTitle>Alerts</PageTitle>
      <TightSection title="From wired sources">
        {snapshot.alerts.length ? (
          snapshot.alerts.map((alert) => (
            <div key={alert.id} className="flex items-baseline gap-2 border-t border-border px-2 py-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{alert.title}</p>
                <p className="truncate text-[10px] text-muted-foreground">{alert.detail}</p>
              </div>
              {alert.href ? (
                <Link href={routeHref(alert.href)} className="text-[11px] font-semibold text-brand">
                  Open
                </Link>
              ) : null}
            </div>
          ))
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">No alerts from the ledger or GitHub activity.</p>
        )}
      </TightSection>
      <ConnectFootnote
        sources={snapshot.sources.filter(
          (source) => source.id === "spotify" || source.id === "tiktok" || source.id === "avanza",
        )}
      />
    </PageFrame>
  );
}
