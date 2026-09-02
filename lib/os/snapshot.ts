import { cache } from "react";

import { listAccounts } from "@/lib/accounting/service";
import { getAccountingDb } from "@/lib/accounting/db";
import { catalogSongs } from "@/lib/site-data";

import { buildActions } from "./actions";
import { taxUpcoming } from "./calendar";
import { COMPANY } from "./company";
import { berlinYmd, parseCatalogDate } from "./format";
import { buildLedgerSnapshot, type RawLedgerEntry } from "./ledger";
import {
  fetchGithubProjects,
  fetchVercelProjects,
  matchProjectLedger,
  mergeVercelIntoProjects,
} from "./projects";
import { osPath } from "./paths";
import type { OsPageSlug } from "./route";
import { hasOsSession } from "./session";
import { loadSpotifyHistory } from "./spotify-history";
import { listTasks } from "./tasks";
import { connectBlocks, detectSources, sourceById } from "./sources";
import type { LedgerSnapshot, OsSnapshot, ReleaseRow, UpcomingRow } from "./types";
import { loadPersonalWealth, loadSpotifyArtist } from "./wealth";

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
    projects: [],
    projectsError: null,
    releases: catalogReleases(todayYmd()),
    actions: [],
    tasks: [],
    tasksError: null,
    upcoming: [],
    wealth: null,
    spotify: null,
    spotifyHistory: loadSpotifyHistory(),
    connect: connectBlocks(sources),
    ...overrides,
  };
}

export const loadLedgerBundle = cache(async (): Promise<{
  ledger: LedgerSnapshot | null;
  ledgerError: string | null;
}> => {
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
});

export const loadProjectBundle = cache(async (): Promise<{
  projects: OsSnapshot["projects"];
  projectsError: string | null;
}> => {
  try {
    const [{ ledger }, github] = await Promise.all([loadLedgerBundle(), fetchGithubProjects(null)]);
    let projects = github.map((project) => {
      const money = matchProjectLedger(project.name, ledger);
      return { ...project, revenueCents: money.revenueCents, costCents: money.costCents };
    });
    if (sourceById(detectSources(), "vercel")?.wired) {
      try {
        projects = mergeVercelIntoProjects(projects, await fetchVercelProjects());
      } catch {
        // Keep GitHub rows; Vercel is optional enrichment.
      }
    }
    return { projects, projectsError: null };
  } catch (error) {
    return {
      projects: [],
      projectsError: error instanceof Error ? error.message : "GitHub unavailable",
    };
  }
});

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
  const [ledgerBundle, projectBundle, taskBundle] = await Promise.all([
    loadLedgerBundle(),
    loadProjectBundle(),
    listTasks(),
  ]);
  const upcoming = buildUpcoming(accessKey, ledgerBundle.ledger, nowYmd);
  const context = {
    ledger: ledgerBundle.ledger,
    projects: projectBundle.projects,
    upcoming,
    nowYmd,
    vaultBase: vaultBase(accessKey),
  };
  return emptySnapshot({
    ...ledgerBundle,
    ...projectBundle,
    tasks: taskBundle.tasks,
    tasksError: taskBundle.error,
    upcoming,
    actions: buildActions(context),
  });
}

export async function loadMusicSnapshot(): Promise<OsSnapshot> {
  return emptySnapshot({ spotify: await loadSpotifyBundle() });
}

export async function loadProjectsSnapshot(): Promise<OsSnapshot> {
  return emptySnapshot(await loadProjectBundle());
}

export async function loadWealthSnapshot(): Promise<OsSnapshot> {
  const [ledgerBundle, wealth] = await Promise.all([loadLedgerBundle(), loadWealthBundle()]);
  return emptySnapshot({ ...ledgerBundle, wealth });
}

export async function loadPageSnapshot(accessKey: string, page: OsPageSlug): Promise<OsSnapshot> {
  switch (page) {
    case "music":
      return loadMusicSnapshot();
    case "projects":
      return loadProjectsSnapshot();
    // Money absorbed Tax, Work, Invest and Wealth, so it needs the trading book
    // alongside the ledger.
    case "money":
      return loadWealthSnapshot();
    // Tasks shows the same derived work queue the Overview summarises.
    case "tasks":
      return loadOverviewSnapshot(accessKey);
    default:
      return loadOverviewSnapshot(accessKey);
  }
}

export async function loadOsPage(accessKey: string, page: OsPageSlug = "") {
  if (!(await hasOsSession(accessKey))) return null;
  if (page === "vault") return emptySnapshot();
  return loadPageSnapshot(accessKey, page);
}
