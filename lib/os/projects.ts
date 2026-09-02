import { COMPANY } from "./company";
import type { LedgerSnapshot, ProjectRow } from "./types";

type GithubRepo = {
  name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
  language: string | null;
};

function kindFor(name: string, description: string | null): ProjectRow["kind"] {
  const hay = `${name} ${description ?? ""}`.toLowerCase();
  if (/(music|song|distro|spotify|wallerstedt\.live|wallerstedtlive)/.test(hay)) return "music";
  if (/(ai|agent|llm|operator|chat)/.test(hay)) return "ai";
  if (/(client|consult)/.test(hay)) return "client";
  if (/(site|web|design|ios|gym|schema)/.test(hay)) return "site";
  return "other";
}

function matchLedger(name: string, ledger: LedgerSnapshot | null) {
  if (!ledger) return { revenueCents: null as number | null, costCents: null as number | null };
  const needle = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (needle.length < 4) return { revenueCents: null, costCents: null };
  let revenueCents = 0;
  let costCents = 0;
  let hit = false;
  for (const row of ledger.counterparties) {
    const hay = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (hay.includes(needle) || needle.includes(hay)) {
      revenueCents += row.cents;
      hit = true;
    }
  }
  for (const row of [...ledger.recent, ...ledger.largestExpenses]) {
    const hay = row.description.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (hay.includes(needle) && row.kind === "expense") {
      costCents += row.amountCents;
      hit = true;
    }
  }
  if (!hit) return { revenueCents: null, costCents: null };
  return { revenueCents, costCents };
}

export async function fetchGithubProjects(ledger: LedgerSnapshot | null): Promise<ProjectRow[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "wallerstedt.live-os",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `https://api.github.com/users/${COMPANY.githubUser}/repos?per_page=100&sort=pushed`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}`);
  }
  const repos = (await response.json()) as GithubRepo[];
  return repos
    .filter((repo) => !repo.fork)
    .slice(0, 24)
    .map((repo) => {
      const money = matchLedger(repo.name, ledger);
      return {
        name: repo.name,
        status: repo.archived ? "archived" : "active",
        currentTask: repo.description,
        nextAction: null,
        repo: `${COMPANY.githubUser}/${repo.name}`,
        repoUrl: repo.html_url,
        website: repo.homepage || null,
        revenueCents: money.revenueCents,
        costCents: money.costCents,
        hours: null,
        notes: repo.language,
        lastActivity: repo.pushed_at,
        kind: kindFor(repo.name, repo.description),
      };
    });
}

type VercelProject = {
  name: string;
  link?: { type?: string; repo?: string; org?: string };
  targets?: { production?: { url?: string } };
};

export async function fetchVercelProjects(): Promise<Array<{ name: string; url: string | null; repo: string | null }>> {
  const token = process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_ACCESS_TOKEN?.trim();
  if (!token) return [];
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const url = new URL("https://api.vercel.com/v9/projects");
  if (teamId) url.searchParams.set("teamId", teamId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Vercel ${response.status}`);
  const body = (await response.json()) as { projects?: VercelProject[] };
  return (body.projects ?? []).map((project) => ({
    name: project.name,
    url: project.targets?.production?.url ? `https://${project.targets.production.url}` : null,
    repo: project.link?.org && project.link.repo ? `${project.link.org}/${project.link.repo}` : null,
  }));
}

export function mergeVercelIntoProjects(
  projects: ProjectRow[],
  vercel: Array<{ name: string; url: string | null; repo: string | null }>,
) {
  const byRepo = new Map(projects.map((project) => [project.repo?.toLowerCase(), project]));
  for (const item of vercel) {
    const match = item.repo ? byRepo.get(item.repo.toLowerCase()) : null;
    if (match && item.url && !match.website) match.website = item.url;
  }
  return projects;
}
