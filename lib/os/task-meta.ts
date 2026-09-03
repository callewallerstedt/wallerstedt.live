import type { TaskArea, TaskList } from "./types";

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
