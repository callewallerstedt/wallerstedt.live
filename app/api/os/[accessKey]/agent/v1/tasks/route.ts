import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { createTask, findOpenTaskByTitle, listTasks, reorderTasks } from "@/lib/os/tasks";
import { TASK_AREAS } from "@/lib/os/task-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(4000).optional(),
  area: z.enum(TASK_AREAS as [string, ...string[]]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "open";
    const area = url.searchParams.get("area");
    const { tasks, error } = await listTasks();
    const filtered = tasks
      .filter((task) => (status === "all" ? true : status === "done" ? task.done : !task.done))
      .filter((task) => (area ? task.area === area : true));
    return privateJson({ ok: true, count: filtered.length, tasks: filtered, error });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(createSchema, await parseJson(request, 20_000));

    const existing = await findOpenTaskByTitle(input.title);
    if (existing) return privateJson({ ok: true, task: existing, created: false });

    const task = await createTask({
      title: input.title,
      notes: input.notes,
      area: input.area as never,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
    });
    return privateJson({ ok: true, task, created: true }, 201);
  });
}

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

/** Reprioritise. A partial list moves those tasks to the top, in that order. */
export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const input = parseWithSchema(reorderSchema, await parseJson(request, 20_000));
    const tasks = await reorderTasks(input.ids);
    return privateJson({ ok: true, tasks });
  });
}
