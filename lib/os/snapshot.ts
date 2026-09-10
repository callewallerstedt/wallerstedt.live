import { cache } from "react";
import { unstable_cache } from "next/cache";

import { listAccounts } from "@/lib/accounting/service";
import { getAccountingDb } from "@/lib/accounting/db";
import { catalogSongs } from "@/lib/site-data";

import { buildActions } from "./actions";
import { OS_LEDGER_CACHE_TAG } from "./cache";
import { taxUpcoming } from "./calendar";
import { COMPANY } from "./company";
import { berlinYmd, parseCatalogDate } from "./format";
import { buildLedgerSnapshot, type RawLedgerEntry } from "./ledger";
import { osPath } from "./paths";
import type { OsPageSlug } from "./route";
import { hasOsSession } from "./session";
import { listTasks } from "./tasks";
import { connectBlocks, detectSources, sourceById } from "./sources";
import { osSnapshotKind, publishLedger } from "./snapshot-shape";
import type { LedgerSnapshot, OsSnapshot, ReleaseRow, UpcomingRow } from "./types";
import { loadPersonalWealth, loadSpotifyArtist } from "./wealth";

export { osSnapshotKind, publishLedger } from "./snapshot-shape";
export type { OsSnapshotKind } from "./snapshot-shape";

async function loadRawEntries(): Promise<RawLedgerEntry[]> {
  const rows = await getAccountingDb().accountingEntry.findMany({
    where: { deletedAt: null },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { documents: { where: { deletedAt: null } } } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    description: row.description,
    debitAccount: row.debitAccount,
    creditAccount: row.creditAccount,
    debitName: row.debitName,
    creditName: row.creditName,
    amount: row.amount,
    vatAmount: row.vatAmount,
    type: row.type,
    receiptRequired: row.receiptRequired,
    documentCount: row._count.documents,
  }));
}

function catalogReleases(nowYmd: string): ReleaseRow[] {
  const seen = new Set<string>();
  const rows: ReleaseRow[] = [];
  for (const song of catalogSongs) {
    const date = parseCatalogDate(song.releaseDate);
    if (!date || seen.has(`${song.slug}-${date}`)) continue;
    seen.add(`${song.slug}-${date}`);
    rows.push({
      title: song.title,
      date,
      slug: song.slug,
      spotifyUrl: song.platforms.spotify ?? null,
      upcoming: date >= nowYmd,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function todayYmd() {
  return berlinYmd() ?? new Date().toISOString().slice(0, 10);
}

function vaultBase(accessKey: string) {
  return osPath(accessKey, "vault");
}

function buildUpcoming(accessKey: string, ledger: LedgerSnapshot | null, nowYmd: string): UpcomingRow[] {
  const releases = catalogReleases(nowYmd);
  return [
    ...taxUpcoming(nowYmd),
    ...releases
      .filter((row) => row.upcoming)
      .map((row) => ({
        id: `release-${row.slug}`,
        title: row.title,
        date: row.date,
        kind: "release" as const,
        detail: "From the public catalog",
        href: `/music/${row.slug}`,
      })),
    ...(ledger?.missingReceipts.slice(0, 5).map((entry) => ({
      id: `receipt-${entry.id}`,
      title: entry.description,
      date: entry.date ?? nowYmd,
      kind: "task" as const,
      detail: "Receipt missing",
      href: `${vaultBase(accessKey)}?post=${entry.id}`,
    })) ?? []),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

function emptySnapshot(overrides: Partial<OsSnapshot> = {}): OsSnapshot {
  const sources = detectSources();
  return {
    company: {
      name: COMPANY.name,
      vat: COMPANY.vat,
      owner: COMPANY.owner,
    },
    sources,
    ledger: null,
    ledgerError: null,
    releases: catalogReleases(todayYmd()),
    actions: [],
    tasks: [],
    tasksError: null,
    upcoming: [],
    wealth: null,
    spotify: null,
    connect: connectBlocks(sources),
    ...overrides,
  };
}

async function readLedgerBundle(): Promise<{
  ledger: LedgerSnapshot | null;
  ledgerError: string | null;
}> {
  try {
    const [entries, accounts, pendingDraftCount] = await Promise.all([
      loadRawEntries(),
      listAccounts(),
      getAccountingDb().accountingAiDraft.count({ where: { status: "pending" } }),
    ]);
    return {
      ledger: buildLedgerSnapshot(entries, accounts, pendingDraftCount, todayYmd()),
      ledgerError: null,
    };
  } catch (error) {
    return {
      ledger: null,
      ledgerError: error instanceof Error ? error.message : "Ledger unavailable",
    };
  }
}

const readCachedLedgerBundle = unstable_cache(readLedgerBundle, ["os-ledger-bundle"], {
  revalidate: 20,
  tags: [OS_LEDGER_CACHE_TAG],
});

export const loadLedgerBundle = cache(readCachedLedgerBundle);

export const loadSpotifyBundle = cache(async () => {
  const sources = detectSources();
  if (!sourceById(sources, "spotify")?.wired) return null;
  return loadSpotifyArtist();
});

export const loadWealthBundle = cache(async () => {
  const sources = detectSources();
  if (!sourceById(sources, "wealth")?.wired) return null;
  return loadPersonalWealth();
});

export async function loadOverviewSnapshot(accessKey: string): Promise<OsSnapshot> {
  const nowYmd = todayYmd();
  const [ledgerBundle, taskBundle] = await Promise.all([loadLedgerBundle(), listTasks()]);
  const upcoming = buildUpcoming(accessKey, ledgerBundle.ledger, nowYmd);
  const context = {
    ledger: ledgerBundle.ledger,
    upcoming,
    nowYmd,
    vaultBase: vaultBase(accessKey),
  };
  return emptySnapshot({
    ...ledgerBundle,
    ledger: ledgerBundle.ledger ? publishLedger(ledgerBundle.ledger, "overview") : null,
    tasks: taskBundle.tasks,
    tasksError: taskBundle.error,
    upcoming,
    actions: buildActions(context),
  });
}

export async function loadTikTokSnapshot(): Promise<OsSnapshot> {
  const taskBundle = await listTasks();
  return emptySnapshot({
    releases: [],
    tasks: taskBundle.tasks,
    tasksError: taskBundle.error,
  });
}

export async function loadSettingsSnapshot(): Promise<OsSnapshot> {
  return emptySnapshot({ releases: [] });
}

export async function loadMusicSnapshot(): Promise<OsSnapshot> {
  return emptySnapshot({ spotify: await loadSpotifyBundle() });
}

export async function loadWealthSnapshot(): Promise<OsSnapshot> {
  const [ledgerBundle, wealth] = await Promise.all([loadLedgerBundle(), loadWealthBundle()]);
  return emptySnapshot({
    ...ledgerBundle,
    ledger: ledgerBundle.ledger ? publishLedger(ledgerBundle.ledger, "money") : null,
    wealth,
  });
}

export async function loadPageSnapshot(accessKey: string, page: OsPageSlug): Promise<OsSnapshot> {
  switch (osSnapshotKind(page)) {
    case "music":
      return loadMusicSnapshot();
    case "money":
      return loadWealthSnapshot();
    case "tiktok":
      return loadTikTokSnapshot();
    case "settings":
    case "vault":
      return loadSettingsSnapshot();
    case "tasks":
    case "overview":
      return loadOverviewSnapshot(accessKey);
  }
}

export async function loadOsPage(accessKey: string, page: OsPageSlug = "") {
  if (!(await hasOsSession(accessKey))) return null;
  if (page === "vault") return emptySnapshot();
  return loadPageSnapshot(accessKey, page);
}
