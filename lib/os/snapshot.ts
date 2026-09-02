import { cache } from "react";

import { dashboard, listAccounts } from "@/lib/accounting/service";
import { getAccountingDb } from "@/lib/accounting/db";
import { catalogSongs } from "@/lib/site-data";

import { buildAlerts } from "./alerts";
import { taxUpcoming } from "./calendar";
import { COMPANY } from "./company";
import { berlinYmd, parseCatalogDate } from "./format";
import { buildLedgerSnapshot, type RawLedgerEntry } from "./ledger";
import { fetchGithubProjects, fetchVercelProjects, mergeVercelIntoProjects } from "./projects";
import { connectBlocks, detectSources, sourceById } from "./sources";
import type { OsSnapshot, ReleaseRow, UpcomingRow } from "./types";
import { loadPersonalWealth, loadSpotifyArtist } from "./wealth";
import { vaultPath } from "./paths";
import { hasOsSession } from "./session";

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

export const getOsSnapshot = cache(async (accessKey: string): Promise<OsSnapshot> => {
  const nowYmd = berlinYmd() ?? new Date().toISOString().slice(0, 10);
  const sources = detectSources();
  const vaultBase = vaultPath(accessKey);

  let ledger = null;
  let ledgerError: string | null = null;
  try {
    const [entries, accounts, dash] = await Promise.all([
      loadRawEntries(),
      listAccounts(),
      dashboard(),
    ]);
    ledger = buildLedgerSnapshot(entries, accounts, dash.pendingDraftCount, nowYmd);
  } catch (error) {
    ledgerError = error instanceof Error ? error.message : "Ledger unavailable";
  }

  let projects = [] as Awaited<ReturnType<typeof fetchGithubProjects>>;
  let projectsError: string | null = null;
  try {
    projects = await fetchGithubProjects(ledger);
    if (sourceById(sources, "vercel")?.wired) {
      try {
        projects = mergeVercelIntoProjects(projects, await fetchVercelProjects());
      } catch {
        // Keep GitHub rows; Vercel is optional enrichment.
      }
    }
  } catch (error) {
    projectsError = error instanceof Error ? error.message : "GitHub unavailable";
  }

  const releases = catalogReleases(nowYmd);
  const upcoming: UpcomingRow[] = [
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
      href: `${vaultBase}?post=${entry.id}`,
    })) ?? []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const [wealth, spotify] = await Promise.all([
    sourceById(sources, "wealth")?.wired ? loadPersonalWealth() : Promise.resolve(null),
    sourceById(sources, "spotify")?.wired ? loadSpotifyArtist() : Promise.resolve(null),
  ]);

  return {
    company: {
      name: COMPANY.name,
      vat: COMPANY.vat,
      owner: COMPANY.owner,
    },
    sources,
    ledger,
    ledgerError,
    projects,
    projectsError,
    releases,
    alerts: buildAlerts({
      ledger,
      projects,
      upcoming,
      nowYmd,
      vaultBase,
    }),
    upcoming,
    wealth,
    spotify,
    connect: connectBlocks(sources),
  };
});

export async function loadOsPage(accessKey: string) {
  if (!(await hasOsSession(accessKey))) return null;
  return getOsSnapshot(accessKey);
}
