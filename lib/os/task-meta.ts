import type { TaskArea, TaskList, TaskRow, TaskWorkStatus } from "./types";

/**
 * Client-safe task constants. Kept out of `tasks.ts` so importing a label into
 * a browser component does not drag the Prisma client into the bundle.
 */
export const TASK_AREAS: TaskArea[] = ["company", "money", "music", "project", "admin"];

export const TASK_AREA_LABELS: Record<TaskArea, string> = {
  company: "Company",
  money: "Money",
  music: "Music",
  project: "Project",
  admin: "Admin",
};

export function isTaskArea(value: unknown): value is TaskArea {
  return typeof value === "string" && (TASK_AREAS as string[]).includes(value);
}

export const TASK_LISTS: TaskList[] = ["task", "video"];

export function isTaskList(value: unknown): value is TaskList {
  return value === "task" || value === "video";
}

/** Spotify's web search URL also deep-links into the app on a phone. */
export function spotifySearchUrl(query: string) {
  return `https://open.spotify.com/search/${encodeURIComponent(query.trim())}`;
}

/** YouTube search for a piano tutorial of the clip's song. */
export function youtubePianoTutorialUrl(query: string) {
  const song = query.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${song} piano tutorial`)}`;
}

/** Same piano-flavored string the old TikTok search URL used. */
export function tiktokPianoSearchQuery(query: string) {
  return `${query.trim()} piano`;
}

/**
 * TikTok only runs a search when you hit the video-results path with a
 * fresh `t` timestamp — `/search?q=` just opens a blank TikTok page.
 */
export function tiktokPianoSearchUrl(query: string, now = Date.now()) {
  const q = encodeURIComponent(tiktokPianoSearchQuery(query));
  return `https://www.tiktok.com/search/video?q=${q}&t=${now}`;
}

export const TASK_WORK_STATUSES = ["open", "in_progress", "done"] as const;

export function isTaskWorkStatus(value: unknown): value is TaskWorkStatus {
  return value === "open" || value === "in_progress" || value === "done";
}

export function isInProgress(task: Pick<TaskRow, "inProgress" | "status" | "done">) {
  return !task.done && (task.inProgress === true || task.status === "in_progress");
}

export type TaskListStatus = "open" | "in_progress" | "done" | "all";

export type TaskListQuery = {
  list?: TaskList;
  area?: TaskArea;
  status?: TaskListStatus;
  /**
   * Dashboard needs archived rows for the Past section. The agent working
   * list does not — pass false so Past ideas never crowd out active ones.
   */
  includeArchived?: boolean;
};

export function taskListWhere(query: TaskListQuery = {}) {
  const includeArchived = query.includeArchived ?? true;
  const status = query.status ?? "all";
  const where: {
    list?: TaskList;
    area?: TaskArea;
    status?: TaskWorkStatus | { in: TaskWorkStatus[] };
    archivedAt?: null;
  } = {};
  if (query.list) where.list = query.list;
  if (query.area) where.area = query.area;
  // "open" on the agent/dashboard means still in play — practicing counts.
  if (status === "open") where.status = { in: ["open", "in_progress"] };
  else if (status === "in_progress" || status === "done") where.status = status;
  if (!includeArchived) where.archivedAt = null;
  return where;
}

/**
 * First tap on a video-idea check starts practice; second tap marks it done;
 * a tap on a done row opens it again.
 */
export function nextVideoCheckPatch(task: Pick<TaskRow, "done" | "inProgress" | "status">): {
  done: boolean;
  inProgress: boolean;
} {
  if (task.done) return { done: false, inProgress: false };
  if (isInProgress(task)) return { done: true, inProgress: false };
  return { done: false, inProgress: true };
}

/** Same order the dashboard uses: practicing, then open, then the owner's sort. */
export function compareTaskRows(a: TaskRow, b: TaskRow) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const aProgress = isInProgress(a);
  const bProgress = isInProgress(b);
  if (aProgress !== bProgress) return aProgress ? -1 : 1;
  if (aProgress && bProgress) {
    // Most recently started (higher sortOrder we assign on first tap) on top.
    if (a.sortOrder !== b.sortOrder) return b.sortOrder - a.sortOrder;
    return b.createdAt.localeCompare(a.createdAt);
  }
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return b.createdAt.localeCompare(a.createdAt);
}
