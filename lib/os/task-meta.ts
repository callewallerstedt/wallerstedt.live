import type { TaskArea } from "./types";

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
