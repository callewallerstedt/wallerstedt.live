import Link from "next/link";
import { PlugIcon } from "lucide-react";

import { formatDate, formatSek } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import type { ConnectBlock, LedgerEntryRow } from "@/lib/os/types";
import { Sparkline } from "@/components/os/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 p-2">{children}</div>;
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>;
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
    <Card size="sm">
      <CardHeader className="pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {spark && spark.length > 1 ? <Sparkline values={spark} className="h-8 w-24" /> : null}
      </CardContent>
    </Card>
  );
}

export function ConnectCard({ block }: { block: ConnectBlock }) {
  return (
    <Card size="sm">
      <CardHeader className="flex-row items-center gap-2">
        <PlugIcon className="size-4 text-muted-foreground" />
        <CardTitle>{block.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{block.detail}</p>
      </CardContent>
    </Card>
  );
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
    return <p className="px-(--card-spacing) py-1.5 text-sm text-muted-foreground">No posts.</p>;
  }
  return (
    <ul>
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center gap-2 border-t border-border px-(--card-spacing) py-1.5 first:border-t-0"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{entry.description}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {formatDate(entry.date)}
              {entry.missingReceipt ? " · receipt missing" : ""}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums">{formatSek(entry.amountCents)}</p>
          <Link
            href={routeHref(`${vaultBase}?post=${entry.id}`)}
            className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem] font-semibold"
          >
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SourceStrip({
  items,
}: {
  items: Array<{ label: string; wired: boolean }>;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex h-5 items-center gap-1 rounded-lg bg-muted px-2 text-[11px] font-medium text-muted-foreground"
        >
          <span className={item.wired ? "size-1.5 rounded-full bg-brand-gradient" : "size-1.5 rounded-full bg-foreground/20"} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
