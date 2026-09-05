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

/** YouTube search for a piano tutorial of the clip's song. */
export function youtubePianoTutorialUrl(query: string) {
  const song = query.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${song} piano tutorial`)}`;
}

/**
 * TikTok only runs a search when you hit the video-results path with a
 * fresh `t` timestamp — `/search?q=` just opens a blank TikTok page.
 */
export function tiktokPianoSearchUrl(query: string, now = Date.now()) {
  const q = encodeURIComponent(`${query.trim()} piano`);
  return `https://www.tiktok.com/search/video?q=${q}&t=${now}`;
}
