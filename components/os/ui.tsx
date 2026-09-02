import type { ReactNode } from "react";
import Link from "next/link";

import { formatDate, formatSekTile } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import type { LedgerEntryRow, SourceState } from "@/lib/os/types";
import { Sparkline } from "@/components/os/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-1.5 px-[max(0.5rem,env(safe-area-inset-left))] py-1.5 pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

export function PageTitle({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h1 className="text-base font-semibold tracking-tight sm:text-xl">{children}</h1>
      {aside ? <p className="min-w-0 truncate text-[11px] text-muted-foreground">{aside}</p> : null}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <section className="grid grid-cols-2 gap-1 xl:grid-cols-4">{children}</section>;
}

export function KpiCard({
  label,
  value,
  hint,
  spark,
}: {
  label: string;
  value: string;
  hint?: string;
  spark?: number[];
}) {
  return (
    <div className="min-w-0 rounded-md bg-card px-2 py-1.5 ring-1 ring-foreground/10">
      <p className="text-[10px] leading-tight font-medium text-muted-foreground">{label}</p>
      <p className="text-[1.15rem] leading-tight font-semibold break-words tabular-nums tracking-tight sm:text-xl">
        {value}
      </p>
      {hint ? <p className="text-[10px] leading-tight text-muted-foreground">{hint}</p> : null}
      {spark && spark.length > 1 ? <Sparkline values={spark} className="mt-1 h-6 w-full" /> : null}
    </div>
  );
}

export function MoneyStrip({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string }>;
}) {
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-foreground/10 ring-1 ring-foreground/10 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-card px-2 py-1.5">
          <p className="text-[10px] leading-tight font-medium text-muted-foreground">{item.label}</p>
          <p className="text-[1.2rem] leading-tight font-semibold tabular-nums tracking-tight sm:text-xl">
            {item.value}
          </p>
          {item.hint ? <p className="text-[10px] leading-tight text-muted-foreground">{item.hint}</p> : null}
        </div>
      ))}
    </section>
  );
}

export function ConnectFootnote({
  sources,
  extra,
}: {
  sources: SourceState[];
  extra?: string[];
}) {
  const later = [
    ...sources.filter((source) => !source.wired).map((source) => source.label),
    ...(extra ?? []),
  ];
  if (!later.length) return null;
  return <p className="text-[11px] leading-snug text-muted-foreground">Connect later: {later.join(" · ")}</p>;
}

export function EmptyCard({ title, detail }: { title: string; detail: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function EntryList({
  entries,
  vaultBase,
}: {
  entries: LedgerEntryRow[];
  vaultBase: string;
}) {
  if (!entries.length) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">No posts.</p>;
  }
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id} className="border-t border-border first:border-t-0">
          <Link
            href={routeHref(`${vaultBase}?post=${entry.id}`)}
            className="flex items-baseline gap-2 px-2 py-[0.28rem]"
          >
            <p className="min-w-0 flex-1 truncate text-[13px] leading-tight font-medium">{entry.description}</p>
            <p className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{formatDate(entry.date)}</p>
            <p
              className={cn(
                "shrink-0 text-[13px] leading-tight font-semibold tabular-nums",
                entry.kind === "expense" ? "text-muted-foreground" : undefined,
              )}
            >
              {entry.kind === "expense" ? "−" : entry.kind === "income" ? "+" : ""}
              {formatSekTile(entry.amountCents)}
            </p>
            {entry.missingReceipt ? (
              <span className="shrink-0 text-[10px] text-muted-foreground">kvitto</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function OsPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-1.5 p-2">
      <div className="h-5 w-28 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-1 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="h-20 animate-pulse rounded-md bg-muted" />
    </div>
  );
}
