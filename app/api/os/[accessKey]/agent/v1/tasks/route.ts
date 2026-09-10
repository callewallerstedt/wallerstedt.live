import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { createTask, findOpenTaskByTitle, listTasks, reorderTasks } from "@/lib/os/tasks";
import {
  isTaskArea,
  isTaskList,
  TASK_AREAS,
  TASK_LISTS,
  type TaskListStatus,
} from "@/lib/os/task-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const listSchema = z.enum(TASK_LISTS as [string, ...string[]]);

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(4000).optional(),
  list: listSchema.optional(),
  song: z.string().max(300).optional(),
  area: z.enum(TASK_AREAS as [string, ...string[]]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? "open";
    const status: TaskListStatus =
      statusParam === "done" || statusParam === "all" || statusParam === "in_progress"
        ? statusParam
        : "open";
    const areaParam = url.searchParams.get("area");
    const listParam = url.searchParams.get("list");
    if (areaParam && !isTaskArea(areaParam)) {
      return privateJson({ ok: true, count: 0, tasks: [], error: null });
    }
    if (listParam && !isTaskList(listParam)) {
      return privateJson({ ok: true, count: 0, tasks: [], error: null });
    }
    const archivedParam = url.searchParams.get("archived");
    const includeArchived =
      archivedParam === "1" || archivedParam === "all" || archivedParam === "true";
    const { tasks, error } = await listTasks({
      status,
      includeArchived,
      area: areaParam && isTaskArea(areaParam) ? areaParam : undefined,
      list: listParam && isTaskList(listParam) ? listParam : undefined,
    });
    return privateJson({ ok: true, count: tasks.length, tasks, error });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(createSchema, await parseJson(request, 20_000));

    const existing = await findOpenTaskByTitle(input.title, (input.list ?? "task") as never);
    if (existing) return privateJson({ ok: true, task: existing, created: false });

    const task = await createTask({
      title: input.title,
      notes: input.notes,
      list: input.list as never,
      song: input.song,
      area: input.area as never,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
    });
    return privateJson({ ok: true, task, created: true }, 201);
  });
}

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  list: listSchema.optional(),
});

/** Reprioritise. A partial list moves those tasks to the top, in that order. */
export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(reorderSchema, await parseJson(request, 20_000));
    const tasks = await reorderTasks(input.ids, (input.list ?? "task") as never);
    return privateJson({ ok: true, tasks });
  });
}
