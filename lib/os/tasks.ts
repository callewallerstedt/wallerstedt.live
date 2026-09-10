import { cache } from "react";

import { getAccountingDb } from "@/lib/accounting/db";

import { berlinYmd } from "./format";
import {
  compareTaskRows,
  isTaskArea,
  isTaskList,
  isTaskWorkStatus,
  taskListWhere,
  type TaskListQuery,
} from "./task-meta";
import { listTikTokSearchTimes } from "./tiktok-search-store";
import type { TaskArea, TaskList, TaskRow, TaskWorkStatus } from "./types";

export {
  compareTaskRows,
  isInProgress,
  isTaskArea,
  isTaskList,
  isTaskWorkStatus,
  nextVideoCheckPatch,
  spotifySearchUrl,
  TASK_AREAS,
  TASK_AREA_LABELS,
  TASK_LISTS,
  TASK_WORK_STATUSES,
  taskListWhere,
} from "./task-meta";
export type { TaskListQuery, TaskListStatus } from "./task-meta";

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

function toRow(record: TaskRecord, searchedAt?: string | null): TaskRow {
  return {
    id: record.id,
    title: record.title,
    notes: record.notes,
    list: isTaskList(record.list) ? record.list : "task",
    song: record.song,
    done: record.status === "done",
    inProgress: record.status === "in_progress",
    status: isTaskWorkStatus(record.status) ? record.status : "open",
    priority: record.priority === 2 ? "high" : record.priority === 0 ? "low" : "normal",
    area: isTaskArea(record.area) ? record.area : "company",
    dueDate: record.dueDate ? berlinYmd(record.dueDate) : null,
    sortOrder: record.sortOrder,
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
    archivedAt: record.archivedAt ? record.archivedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    tiktokSearchedAt: searchedAt ?? null,
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
export async function listTasks(
  query: TaskListQuery = {},
): Promise<{ tasks: TaskRow[]; error: string | null }> {
  try {
    const includeArchived = query.includeArchived ?? true;
    const status = query.status ?? "all";
    const where = taskListWhere({ ...query, includeArchived, status });
    const filtered = Boolean(
      where.list || where.area || where.status || where.archivedAt === null,
    );
    const rows = await getAccountingDb().companyTask.findMany({
      where: filtered ? where : undefined,
      orderBy:
        status === "all"
          ? [{ status: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }]
          : [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    const searched = await listTikTokSearchTimes(
      rows.filter((row) => row.list === "video").map((row) => row.id),
    );
    return {
      tasks: rows
        .map((row) => toRow(row, searched.get(row.id) ?? null))
        .sort(compareTaskRows),
      error: null,
    };
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
    where: { status: { in: ["open", "in_progress"] }, archivedAt: null, list, title: title.slice(0, 300) },
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

function resolveWorkStatus(input: {
  status?: TaskWorkStatus;
  done?: boolean;
  inProgress?: boolean;
}): TaskWorkStatus | undefined {
  if (input.status) return input.status;
  if (input.done === true) return "done";
  if (input.inProgress === true) return "in_progress";
  if (input.inProgress === false || input.done === false) return "open";
  return undefined;
}

export async function updateTask(
  id: string,
  input: {
    title?: string;
    notes?: string;
    song?: string;
    done?: boolean;
    inProgress?: boolean;
    status?: TaskWorkStatus;
    archived?: boolean;
    area?: TaskArea;
    priority?: TaskRow["priority"];
    dueDate?: string | null;
  },
): Promise<TaskRow | null> {
  const db = getAccountingDb();
  const current = await db.companyTask.findUnique({ where: { id } });
  if (!current) return null;

  const data: Record<string, unknown> = {};
  if (input.title != null) data.title = input.title.slice(0, 300);
  if (input.notes != null) data.notes = input.notes.slice(0, 4000);
  if (input.song != null) data.song = input.song.slice(0, 300);
  if (input.area != null) data.area = input.area;
  if (input.priority != null) data.priority = priorityValue(input.priority);
  if (input.dueDate !== undefined) {
    data.dueDate = input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null;
  }

  const nextStatus = resolveWorkStatus(input);
  if (nextStatus) {
    data.status = nextStatus;
    data.completedAt = nextStatus === "done" ? new Date() : null;
    if (nextStatus === "in_progress" && current.status !== "in_progress") {
      const last = await db.companyTask.findFirst({
        where: { list: current.list, status: "in_progress" },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      // Newest practice sits at the top of the in-progress group (sort desc).
      data.sortOrder = (last?.sortOrder ?? 0) + 1;
    }
    if (nextStatus === "open" && current.status === "in_progress") {
      const firstOpen = await db.companyTask.findFirst({
        where: { list: current.list, status: "open", archivedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { sortOrder: true },
      });
      // Dropping practice puts the idea back at the top of the regular list.
      data.sortOrder = (firstOpen?.sortOrder ?? 0) - 1;
    }
  }

  if (input.archived != null) {
    // Archiving hides a task from the working list without destroying it.
    data.archivedAt = input.archived ? new Date() : null;
  }
  if (!Object.keys(data).length) return null;
  try {
    return toRow(await db.companyTask.update({ where: { id }, data }));
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
