import { z } from "zod";

import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";
import { deleteTask, TASK_AREAS, updateTask } from "@/lib/os/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    notes: z.string().max(4000).optional(),
    done: z.boolean().optional(),
    archived: z.boolean().optional(),
    area: z.enum(TASK_AREAS as [string, ...string[]]).optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update." });

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey, true);
    const input = parseWithSchema(patchSchema, await parseJson(request, 20_000));
    const task = await updateTask(id, input as never);
    if (!task) throw new AccountingError("Task not found.", 404, "not_found");
    return privateJson({ ok: true, task });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey, true);
    if (!(await deleteTask(id))) {
      throw new AccountingError("Task not found.", 404, "not_found");
    }
    return privateJson({ ok: true });
  });
}
