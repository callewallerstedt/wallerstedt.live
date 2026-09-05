import { cache } from "react";

import { getAccountingDb } from "@/lib/accounting/db";

import { berlinYmd } from "./format";
import { isTaskArea, isTaskList } from "./task-meta";
import type { TaskArea, TaskList, TaskRow } from "./types";

export {
  isTaskArea,
  isTaskList,
  spotifySearchUrl,
  TASK_AREAS,
  TASK_AREA_LABELS,
  TASK_LISTS,
} from "./task-meta";

/** The migration may not have run yet on a given database. Never 500 for that. */
function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "42P01";
}

type TaskRecord = {
  id: string;
  title: string;
  notes: string;
  list: string;
  song: string;
  status: string;
  priority: number;
  area: string;
  dueDate: Date | null;
  sortOrder: number;
  completedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRow(record: TaskRecord): TaskRow {
  return {
    id: record.id,
    title: record.title,
    notes: record.notes,
    list: isTaskList(record.list) ? record.list : "task",
    song: record.song,
    done: record.status === "done",
    priority: record.priority === 2 ? "high" : record.priority === 0 ? "low" : "normal",
    area: isTaskArea(record.area) ? record.area : "company",
    dueDate: record.dueDate ? berlinYmd(record.dueDate) : null,
    sortOrder: record.sortOrder,
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
    archivedAt: record.archivedAt ? record.archivedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

function priorityValue(priority: TaskRow["priority"] | undefined) {
  if (priority === "high") return 2;
  if (priority === "low") return 0;
  return 1;
}

/**
 * Open tasks first, ordered by the owner's manual sort, then finished ones so a
 * just-ticked row stays visible instead of vanishing off the list.
 */
export async function listTasks(): Promise<{ tasks: TaskRow[]; error: string | null }> {
  try {
    const rows = await getAccountingDb().companyTask.findMany({
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    return { tasks: rows.map(toRow), error: null };
  } catch (error) {
    if (isMissingTable(error)) {
      return {
        tasks: [],
        error: "Task table missing. Run `npm run prisma:deploy` against this database.",
      };
    }
    return {
      tasks: [],
      error: error instanceof Error ? error.message : "Tasks unavailable",
    };
  }
}

/**
 * An agent that retries a create should not end up with two identical rows, so
 * an open task with the same title is treated as the same task.
 */
export async function findOpenTaskByTitle(
  title: string,
  list: TaskList = "task",
): Promise<TaskRow | null> {
  const row = await getAccountingDb().companyTask.findFirst({
    where: { status: "open", archivedAt: null, list, title: title.slice(0, 300) },
    orderBy: { createdAt: "desc" },
  });
  return row ? toRow(row) : null;
}

export async function getTask(id: string): Promise<TaskRow | null> {
  const row = await getAccountingDb().companyTask.findUnique({ where: { id } });
  return row ? toRow(row) : null;
}

export async function createTask(input: {
  title: string;
  notes?: string;
  list?: TaskList;
  song?: string;
  area?: TaskArea;
  priority?: TaskRow["priority"];
  dueDate?: string | null;
}): Promise<TaskRow> {
  const db = getAccountingDb();
  const list = input.list ?? "task";
  const last = await db.companyTask.findFirst({
    where: { status: "open", list },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return toRow(
    await db.companyTask.create({
      data: {
        title: input.title.slice(0, 300),
        notes: (input.notes ?? "").slice(0, 4000),
        list,
        song: (input.song ?? "").slice(0, 300),
        area: input.area ?? "company",
        priority: priorityValue(input.priority),
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
        // New tasks land at the bottom of the open list.
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    }),
  );
}

export async function updateTask(
  id: string,
  input: {
    title?: string;
    notes?: string;
    song?: string;
    done?: boolean;
    archived?: boolean;
    area?: TaskArea;
    priority?: TaskRow["priority"];
    dueDate?: string | null;
  },
): Promise<TaskRow | null> {
  const data: Record<string, unknown> = {};
  if (input.title != null) data.title = input.title.slice(0, 300);
  if (input.notes != null) data.notes = input.notes.slice(0, 4000);
  if (input.song != null) data.song = input.song.slice(0, 300);
  if (input.area != null) data.area = input.area;
  if (input.priority != null) data.priority = priorityValue(input.priority);
  if (input.dueDate !== undefined) {
    data.dueDate = input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null;
  }
  if (input.done != null) {
    data.status = input.done ? "done" : "open";
    data.completedAt = input.done ? new Date() : null;
  }
  if (input.archived != null) {
    // Archiving hides a task from the working list without destroying it.
    data.archivedAt = input.archived ? new Date() : null;
  }
  if (!Object.keys(data).length) return null;
  try {
    return toRow(await getAccountingDb().companyTask.update({ where: { id }, data }));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "P2025") return null;
    throw error;
  }
}

export async function deleteTask(id: string): Promise<boolean> {
  try {
    await getAccountingDb().companyTask.delete({ where: { id } });
    return true;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "P2025") return false;
    throw error;
  }
}

/**
 * Puts the given open tasks in that order. Anything not named keeps its
 * relative order underneath. Done rows are left alone.
 */
export async function reorderTasks(ids: string[], list: TaskList = "task"): Promise<TaskRow[]> {
  const db = getAccountingDb();
  const wanted = [...new Set(ids)].slice(0, 200);
  const live = await db.companyTask.findMany({
    where: { archivedAt: null, list, status: "open" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  const known = new Set(live.map((row) => row.id));
  const front = wanted.filter((id) => known.has(id));
  const frontSet = new Set(front);
  const order = [...front, ...live.map((row) => row.id).filter((id) => !frontSet.has(id))];

  await db.$transaction(
    order.map((id, index) =>
      db.companyTask.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return (await listTasks()).tasks;
}

/** Cheap enough to run in the layout for the nav badge, and never throws. */
export const openTaskCount = cache(async (): Promise<number> => {
  try {
    return await getAccountingDb().companyTask.count({
      where: { status: "open", archivedAt: null, list: "task" },
    });
  } catch {
    return 0;
  }
});
