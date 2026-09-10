import Link from "next/link";

import {
  CashAndProfitCharts,
  LedgerProblem,
  ResultBars,
  RevenueChart,
  RunningResult,
} from "@/components/os/ledger-panels";
import {
  ConnectFootnote,
  EmptyState,
  EntryList,
  HeroStats,
  KpiCard,
  KpiGrid,
  NoticeCard,
  Panel,
  PageFrame,
  PageTitle,
  Row,
  SectionLabel,
} from "@/components/os/ui";
import { formatDate, formatNumber, formatPercent, formatSek, formatSekTile } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import type { OsSnapshot } from "@/lib/os/types";

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
