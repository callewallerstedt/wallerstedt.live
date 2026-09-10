import Link from "next/link";

import { deltaTone, LatestEntries, LedgerProblem, RunningResult, TaxPanel, vsLast } from "@/components/os/ledger-panels";
import { ActionQueue, TaskList } from "@/components/os/tasks";
import {
  EmptyState,
  HeroStats,
  KpiCard,
  KpiGrid,
  Panel,
  PageFrame,
  PageTitle,
  Row,
} from "@/components/os/ui";
import { formatDate, formatMonthLabel, formatNumber, formatSekTile } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import type { OsSnapshot } from "@/lib/os/types";

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
  const tiktokHref = osPath(accessKey, "tiktok");

  return (
    <PageFrame>
      <PageTitle
        action={
          <Link
            className="rounded-md px-2 py-1 text-xs font-semibold text-brand ring-1 ring-foreground/15 hover:bg-muted"
            href={routeHref(tasksHref)}
          >
            Tasks
          </Link>
        }
        aside={`${snapshot.company.name} · ${snapshot.company.vat}`}
      >
        Overview
      </PageTitle>
      <LedgerProblem snapshot={snapshot} />

      {/* The list comes first: the point of opening the app is to see what to
          do next, not to admire the balance. Video ideas live on the TikTok tab. */}
      <TaskList
        accessKey={accessKey}
        error={snapshot.tasksError}
        limit={6}
        moreHref={tasksHref}
        tasks={snapshot.tasks}
        title="Focus"
        todayYmd={todayYmd}
      />

      <p className="text-xs text-muted-foreground">
        Piano-cover ideas and scans are on{" "}
        <Link className="font-semibold text-brand" href={routeHref(tiktokHref)}>
          TikTok
        </Link>
        .
      </p>

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

      {ledger ? <LatestEntries ledger={ledger} vaultHref={vault} /> : null}
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
