import { z } from "zod";

import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { createTask, listTasks, reorderTasks, TASK_AREAS, TASK_LISTS } from "@/lib/os/tasks";

function parseTaskBody<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AccountingError("Could not save that task.", 400, "validation_error", {
      fields: result.error.flatten().fieldErrors,
      form: result.error.flatten().formErrors,
    });
  }
  return result.data;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const areaSchema = z.enum(TASK_AREAS as [string, ...string[]]);
const prioritySchema = z.enum(["low", "normal", "high"]);
const dueSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const listSchema = z.enum(TASK_LISTS as [string, ...string[]]);

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(4000).optional(),
  list: listSchema.optional(),
  song: z.string().max(300).optional(),
  area: areaSchema.optional(),
  priority: prioritySchema.optional(),
  dueDate: dueSchema.optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  list: listSchema.optional(),
});

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ ok: true, ...(await listTasks()) });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const input = parseTaskBody(createSchema, await parseJson(request, 20_000));
    const task = await createTask({
      title: input.title,
      notes: input.notes,
      list: input.list as never,
      song: input.song,
      area: input.area as never,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
    });
    return privateJson({ ok: true, task }, 201);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const input = parseTaskBody(reorderSchema, await parseJson(request, 20_000));
    const tasks = await reorderTasks(input.ids, (input.list ?? "task") as never);
    return privateJson({ ok: true, tasks, error: null });
  });
}
