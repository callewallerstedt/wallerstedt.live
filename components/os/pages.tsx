import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";

import { formatDate, formatMonthLabel, formatNumber, formatPercent, formatSek } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { osPath, vaultPath } from "@/lib/os/paths";
import type { OsSnapshot } from "@/lib/os/types";
import { TrendChart } from "@/components/os/charts";
import {
  ConnectCard,
  EmptyCard,
  EntryList,
  KpiCard,
  PageFrame,
  PageTitle,
  SourceStrip,
} from "@/components/os/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function connect(snapshot: OsSnapshot, id: OsSnapshot["connect"][number]["source"]) {
  return snapshot.connect.find((item) => item.source === id);
}

export function OverviewPage({ snapshot, accessKey }: { snapshot: OsSnapshot; accessKey: string }) {
  const ledger = snapshot.ledger;
  const vault = vaultPath(accessKey);
  const spark = ledger?.months.map((row) => row.incomeCents) ?? [];
  const spotify = connect(snapshot, "spotify");
  const tiktok = connect(snapshot, "tiktok");

  return (
    <PageFrame>
      <PageTitle>Overview</PageTitle>
      <p className="text-sm text-muted-foreground">
        {snapshot.company.name} · {snapshot.company.vat}
      </p>
      <SourceStrip items={snapshot.sources.map((source) => ({ label: source.label, wired: source.wired }))} />

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Company value"
          value={ledger ? formatSek(ledger.ledgerAssetsCents) : "—"}
          hint="Booked 1930 + 1385"
          spark={spark}
        />
        <KpiCard
          label="Revenue this month"
          value={ledger ? formatSek(ledger.incomeMonthCents) : "—"}
          hint={ledger?.month}
        />
        <KpiCard
          label="Profit this year"
          value={ledger ? formatSek(ledger.profitYtdCents) : "—"}
          hint="Booked YTD, not annualized"
        />
        <KpiCard
          label="Cash after tax"
          value={ledger ? formatSek(ledger.cashAfterTaxCents) : "—"}
          hint="1930 − VAT − 20.6% of YTD"
        />
        <KpiCard
          label="Spotify"
          value={snapshot.spotify?.followers != null ? formatNumber(snapshot.spotify.followers) : "—"}
          hint={snapshot.spotify?.followers != null ? "Public followers. Streams not wired." : "Not connected"}
        />
        <KpiCard label="TikTok → Spotify" value="—" hint="Not connected" />
        <KpiCard
          label="Active projects"
          value={formatNumber(snapshot.projects.filter((project) => project.status === "active").length)}
          hint="Public GitHub"
        />
        <KpiCard
          label="Attention"
          value={formatNumber(snapshot.alerts.length)}
          hint={snapshot.alerts[0]?.title ?? "None"}
        />
      </section>

      {ledgerErrorCard(snapshot)}

      <section className="grid gap-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Revenue 12m</CardTitle>
            {ledger ? (
              <p className="text-sm font-semibold tabular-nums text-brand">{formatSek(ledger.incomeYtdCents)}</p>
            ) : null}
          </CardHeader>
          <CardContent className="h-52">
            {ledger && ledger.months.some((row) => row.incomeCents || row.expenseCents) ? (
              <TrendChart
                label="Booked monthly revenue"
                values={ledger.months.map((row) => row.incomeCents)}
                labels={ledger.months.map((row) => formatMonthLabel(row.month))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No booked months yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attention</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {snapshot.alerts.length ? (
              snapshot.alerts.slice(0, 6).map((alert) => (
                <div key={alert.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5 ring-1 ring-foreground/6">
                  <p className="min-w-0 flex-1 text-sm font-semibold">{alert.title}</p>
                  {alert.href ? (
                    <Link href={routeHref(alert.href)} className="text-xs font-semibold text-brand">
                      Open
                    </Link>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nothing from wired sources.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Ledger</CardTitle>
            <Link href={routeHref(vault)} className="text-sm font-semibold text-brand">
              Vault
            </Link>
          </CardHeader>
          <CardContent className="px-0">
            {ledger ? <EntryList entries={ledger.recent} vaultBase={vault} /> : <p className="px-2 text-sm text-muted-foreground">No ledger.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {snapshot.projects.slice(0, 6).map((project) => (
              <div key={project.repo ?? project.name} className="flex items-center gap-2 border-t border-border px-(--card-spacing) py-1.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{project.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{project.lastActivity?.slice(0, 10) ?? "—"}</p>
                </div>
                {project.repoUrl ? (
                  <Link href={routeHref(project.repoUrl)} className="text-muted-foreground">
                    <ArrowUpRightIcon className="size-4" />
                  </Link>
                ) : null}
              </div>
            ))}
            {snapshot.projectsError ? <p className="px-2 text-sm text-muted-foreground">{snapshot.projectsError}</p> : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        {spotify ? <ConnectCard block={spotify} /> : null}
        {tiktok ? <ConnectCard block={tiktok} /> : null}
      </section>
    </PageFrame>
  );
}

function ledgerErrorCard(snapshot: OsSnapshot) {
  if (!snapshot.ledgerError) return null;
  return <EmptyCard title="Ledger" detail={snapshot.ledgerError} />;
}

export function MoneyPage({ snapshot, accessKey }: { snapshot: OsSnapshot; accessKey: string }) {
  const ledger = snapshot.ledger;
  const vault = vaultPath(accessKey);
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
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Bank 1930" value={formatSek(ledger.bankCents)} hint="Booked, not live bank" />
        <KpiCard label="KF 1385" value={formatSek(ledger.kfDepositedCents)} hint="Deposited book value" />
        <KpiCard label="Ledger assets" value={formatSek(ledger.ledgerAssetsCents)} />
        <KpiCard label="Safe to spend" value={formatSek(ledger.cashAfterTaxCents)} hint="Estimate from books" />
        <KpiCard label="Revenue month" value={formatSek(ledger.incomeMonthCents)} />
        <KpiCard label="Revenue YTD" value={formatSek(ledger.incomeYtdCents)} />
        <KpiCard label="Expenses month" value={formatSek(ledger.expenseMonthCents)} />
        <KpiCard label="Profit YTD" value={formatSek(ledger.profitYtdCents)} />
      </section>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Software YTD" value={formatSek(ledger.softwareCents)} hint="From descriptions + 6540" />
        <KpiCard label="Hardware YTD" value={formatSek(ledger.hardwareCents)} />
        <KpiCard label="Ads YTD" value={formatSek(ledger.adsCents)} />
        <KpiCard label="Accounting YTD" value={formatSek(ledger.accountingCents)} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>12-month revenue</CardTitle>
        </CardHeader>
        <CardContent className="h-52">
          <TrendChart
            values={ledger.months.map((row) => row.incomeCents)}
            labels={ledger.months.map((row) => formatMonthLabel(row.month))}
          />
        </CardContent>
      </Card>
      <section className="grid gap-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <EntryList entries={ledger.recent} vaultBase={vault} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Largest expenses</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <EntryList entries={ledger.largestExpenses} vaultBase={vault} />
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {ledger.categories.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{row.label}</p>
                <p className="text-sm font-semibold tabular-nums">{formatSek(row.cents)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recurring</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {ledger.recurring.length ? (
              ledger.recurring.map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{row.label}</p>
                    <p className="text-[11px] text-muted-foreground">{row.months} months</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{formatSek(row.lastCents)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No repeating descriptions yet.</p>
            )}
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Receipts missing</CardTitle>
          <Link href={routeHref(vault)} className="text-sm font-semibold text-brand">
            Vault
          </Link>
        </CardHeader>
        <CardContent className="px-0">
          <EntryList entries={ledger.missingReceipts} vaultBase={vault} />
        </CardContent>
      </Card>
      {connect(snapshot, "bank") ? <ConnectCard block={connect(snapshot, "bank")!} /> : null}
    </PageFrame>
  );
}

export function MusicPage({ snapshot }: { snapshot: OsSnapshot }) {
  const spotify = connect(snapshot, "spotify");
  const distrokid = connect(snapshot, "distrokid");
  return (
    <PageFrame>
      <PageTitle>Music</PageTitle>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Streams today" value="—" hint="Spotify for Artists not connected" />
        <KpiCard label="Streams 7d" value="—" hint="Not connected" />
        <KpiCard label="Streams month" value="—" hint="Not connected" />
        <KpiCard
          label="Followers"
          value={snapshot.spotify?.followers != null ? formatNumber(snapshot.spotify.followers) : "—"}
          hint={snapshot.spotify ? "Public artist profile" : "Not connected"}
        />
      </section>
      {spotify ? <ConnectCard block={spotify} /> : null}
      {distrokid ? <ConnectCard block={distrokid} /> : (
        <EmptyCard title="DistroKid" detail="No payout token. Pending/received stays empty." />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Release calendar</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <ul>
            {snapshot.releases.map((row) => (
              <li key={`${row.slug}-${row.date}`} className="flex items-center gap-2 border-t border-border px-(--card-spacing) py-1.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.title}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(row.date)}</p>
                </div>
                {row.spotifyUrl ? (
                  <Link href={routeHref(row.spotifyUrl)} className="text-sm font-semibold text-brand">
                    Spotify
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageFrame>
  );
}

export function ContentPage({ snapshot }: { snapshot: OsSnapshot }) {
  const tiktok = connect(snapshot, "tiktok");
  const spotify = connect(snapshot, "spotify");
  return (
    <PageFrame>
      <PageTitle>Content</PageTitle>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="TikTok today" value="—" hint="Not connected" />
        <KpiCard label="TikTok 7d" value="—" hint="Not connected" />
        <KpiCard label="TikTok 30d" value="—" hint="Not connected" />
        <KpiCard label="Spotify clicks" value="—" hint="Not connected" />
      </section>
      {tiktok ? <ConnectCard block={tiktok} /> : null}
      {spotify ? <ConnectCard block={spotify} /> : null}
      <EmptyCard
        title="Streams per 1k TikTok views"
        detail="Needs both TikTok and Spotify for Artists. Nothing is estimated."
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
        <EmptyCard title="Projects" detail="No public repos returned." />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Public repos</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {snapshot.projects.map((project) => (
            <div key={project.repo ?? project.name} className="grid gap-1 border-t border-border px-(--card-spacing) py-1.5 first:border-t-0 sm:grid-cols-[1fr_auto_auto]">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{project.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {project.status}
                  {project.notes ? ` · ${project.notes}` : ""}
                  {project.lastActivity ? ` · ${project.lastActivity.slice(0, 10)}` : ""}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Rev {project.revenueCents == null ? "—" : formatSek(project.revenueCents)}
                {" · "}
                Cost {project.costCents == null ? "—" : formatSek(project.costCents)}
                {" · "}
                Hours —
              </p>
              <div className="flex gap-2">
                {project.repoUrl ? (
                  <Link href={routeHref(project.repoUrl)} className="text-sm font-semibold text-brand">
                    Repo
                  </Link>
                ) : null}
                {project.website ? (
                  <Link href={routeHref(project.website)} className="text-sm font-semibold text-brand">
                    Site
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageFrame>
  );
}

export function CustomersPage({ snapshot }: { snapshot: OsSnapshot }) {
  const ledger = snapshot.ledger;
  return (
    <PageFrame>
      <PageTitle>Work</PageTitle>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Paid counterparties" value={formatNumber(ledger?.counterparties.length ?? 0)} hint="From income descriptions" />
        <KpiCard label="Leads" value="—" hint="No CRM" />
        <KpiCard label="Quotes" value="—" hint="No CRM" />
        <KpiCard label="Open invoices" value="—" hint="No invoice source" />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Revenue per description</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {ledger?.counterparties.length ? (
            ledger.counterparties.map((row) => (
              <div key={row.name} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(row.lastDate)}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{formatSek(row.cents)}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No income posts.</p>
          )}
        </CardContent>
      </Card>
      <EmptyCard title="Follow-ups" detail="No customer pipeline is wired. Ledger income is shown above." />
      <Link href={routeHref(osPath("accounting"))} className="text-sm font-semibold text-brand">
        Tax
      </Link>
    </PageFrame>
  );
}

export function AccountingPage({ snapshot, accessKey }: { snapshot: OsSnapshot; accessKey: string }) {
  const ledger = snapshot.ledger;
  const vault = vaultPath(accessKey);
  return (
    <PageFrame>
      <PageTitle>Tax</PageTitle>
      <p className="text-sm text-muted-foreground">Official books stay in the vault. This page only reads them.</p>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="VAT payable" value={ledger ? formatSek(ledger.vatPayableCents) : "—"} hint="Income VAT − expense VAT" />
        <KpiCard
          label="Employer"
          value={ledger?.employerCents == null ? "—" : formatSek(ledger.employerCents)}
          hint={ledger?.employerCents == null ? "Konto 2730 unused" : "Konto 2730"}
        />
        <KpiCard
          label="Källskatt"
          value={ledger?.withholdingCents == null ? "—" : formatSek(ledger.withholdingCents)}
          hint={ledger?.withholdingCents == null ? "Konto 2710 unused" : "Employee withholding · 2710"}
        />
        <KpiCard
          label="Corp tax estimate"
          value={ledger ? formatSek(ledger.corpTaxEstimateCents) : "—"}
          hint="20.6% of booked YTD"
        />
        <KpiCard
          label="Tax account"
          value={ledger?.taxAccountCents == null ? "—" : formatSek(ledger.taxAccountCents)}
          hint={ledger?.taxAccountCents == null ? "Konto 1630 unused" : "Konto 1630"}
        />
        <KpiCard label="Booked revenue YTD" value={ledger ? formatSek(ledger.incomeYtdCents) : "—"} />
        <KpiCard label="Booked expenses YTD" value={ledger ? formatSek(ledger.expenseYtdCents) : "—"} />
        <KpiCard
          label="After-tax YTD"
          value={ledger ? formatSek(ledger.afterTaxYtdCents) : "—"}
          hint="Booked YTD − 20.6% estimate. Not distributable equity."
        />
      </section>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Receipts missing</CardTitle>
          <Link href={routeHref(vault)} className="text-sm font-semibold text-brand">
            Edit in vault
          </Link>
        </CardHeader>
        <CardContent className="px-0">
          {ledger ? <EntryList entries={ledger.missingReceipts} vaultBase={vault} /> : null}
        </CardContent>
      </Card>
      {ledgerErrorCard(snapshot)}
    </PageFrame>
  );
}

export function InvestmentsPage({ snapshot }: { snapshot: OsSnapshot }) {
  const ledger = snapshot.ledger;
  const avanza = connect(snapshot, "avanza");
  return (
    <PageFrame>
      <PageTitle>Invest</PageTitle>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="KF deposited" value={ledger ? formatSek(ledger.kfDepositedCents) : "—"} hint="Konto 1385" />
        <KpiCard label="KF market" value="—" hint="Avanza not connected" />
        <KpiCard label="Unrealized" value="—" hint="Needs market value" />
        <KpiCard label="Vs index" value="—" hint="Not connected" />
      </section>
      {avanza ? <ConnectCard block={avanza} /> : null}
    </PageFrame>
  );
}

export function WealthPage({ snapshot }: { snapshot: OsSnapshot }) {
  const ledger = snapshot.ledger;
  const wealth = snapshot.wealth;
  return (
    <PageFrame>
      <PageTitle>Wealth</PageTitle>
      <EmptyCard
        title="Not bokföring"
        detail="Personal figures stay off the official books. Company numbers below are booked ledger only."
      />
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Company cash" value={ledger ? formatSek(ledger.bankCents) : "—"} hint="1930 booked" />
        <KpiCard label="Company KF deposited" value={ledger ? formatSek(ledger.kfDepositedCents) : "—"} hint="1385 booked" />
        <KpiCard
          label="Personal trading capital"
          value={wealth ? formatSek(wealth.capitalCents) : "—"}
          hint={wealth?.source ?? "Unavailable"}
        />
        <KpiCard
          label="Personal open P&L"
          value={wealth?.openPnlCents == null ? "—" : formatSek(wealth.openPnlCents)}
          hint="Trading desk"
        />
      </section>
      <KpiCard label="Savings this month" value="—" hint="No personal bank feed" />
      <KpiCard label="Savings rate" value="—" hint="No personal income feed" />
      {wealth ? (
        <Card>
          <CardHeader>
            <CardTitle>Personal positions</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {wealth.positions.map((position) => (
              <div key={position.symbol} className="flex items-center gap-2 border-t border-border px-(--card-spacing) py-1.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{position.symbol}</p>
                  <p className="text-[11px] text-muted-foreground">{position.name}</p>
                </div>
                <p className="text-sm tabular-nums">{formatPercent((position.pnlPct ?? 0) / 100)}</p>
              </div>
            ))}
            <p className="px-(--card-spacing) py-1.5 text-[11px] text-muted-foreground">{wealth.disclaimer}</p>
          </CardContent>
        </Card>
      ) : (
        <EmptyCard title="Personal trading" detail="Trading book could not be read." />
      )}
    </PageFrame>
  );
}

export function UpcomingPage({ snapshot }: { snapshot: OsSnapshot }) {
  return (
    <PageFrame>
      <PageTitle>Upcoming</PageTitle>
      <Card>
        <CardHeader>
          <CardTitle>Dates</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {snapshot.upcoming.length ? (
            snapshot.upcoming.map((item) => (
              <div key={item.id} className="flex items-center gap-2 border-t border-border px-(--card-spacing) py-1.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{item.detail}</p>
                </div>
                <p className="text-sm tabular-nums text-muted-foreground">{formatDate(item.date)}</p>
              </div>
            ))
          ) : (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No dated items from wired sources.</p>
          )}
        </CardContent>
      </Card>
      <EmptyCard title="Meetings" detail="No calendar is connected." />
      <EmptyCard title="Subscription renewals" detail="No vendor billing API. Recurring ledger rows live under Money." />
    </PageFrame>
  );
}

export function AlertsPage({ snapshot }: { snapshot: OsSnapshot }) {
  return (
    <PageFrame>
      <PageTitle>Alerts</PageTitle>
      <Card>
        <CardHeader>
          <CardTitle>From wired sources</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {snapshot.alerts.length ? (
            snapshot.alerts.map((alert) => (
              <div key={alert.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5 ring-1 ring-foreground/6">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="text-[11px] text-muted-foreground">{alert.detail}</p>
                </div>
                {alert.href ? (
                  <Link href={routeHref(alert.href)} className="text-sm font-semibold text-brand">
                    Open
                  </Link>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No alerts from the ledger or GitHub activity.</p>
          )}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Spotify drops, TikTok spikes, and Avanza moves stay hidden until those APIs exist.
      </p>
    </PageFrame>
  );
}
