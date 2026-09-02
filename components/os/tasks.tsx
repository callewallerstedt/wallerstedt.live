"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { Panel, Pill, Row } from "@/components/os/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { TASK_AREA_LABELS, TASK_AREAS } from "@/lib/os/task-meta";
import type { ActionItem, TaskArea, TaskRow } from "@/lib/os/types";
import { cn } from "@/lib/utils";

type Patch = Partial<Pick<TaskRow, "title" | "done" | "area" | "priority" | "dueDate">>;

function endpoint(accessKey: string, id?: string) {
  return `/api/os/${encodeURIComponent(accessKey)}/tasks${id ? `/${id}` : ""}`;
}

function overdue(task: TaskRow, todayYmd: string) {
  return !task.done && task.dueDate != null && task.dueDate < todayYmd;
}

function dueLabel(task: TaskRow, todayYmd: string) {
  if (!task.dueDate) return null;
  if (task.dueDate === todayYmd) return "Today";
  if (task.dueDate < todayYmd) return `Overdue · ${formatDate(task.dueDate)}`;
  return formatDate(task.dueDate);
}

/**
 * The owner's own to-do list. Every change writes through to Postgres; the UI
 * updates optimistically first so ticking something off feels instant on a
 * phone with a slow connection.
 */
export function TaskList({
  accessKey,
  tasks,
  error,
  todayYmd,
  limit,
  moreHref,
  title = "To do",
}: {
  accessKey: string;
  tasks: TaskRow[];
  error: string | null;
  todayYmd: string;
  limit?: number;
  moreHref?: string;
  title?: string;
}) {
  const [serverTasks, setServerTasks] = useState(tasks);
  const [pending, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic(
    serverTasks,
    (state: TaskRow[], action: { type: "patch"; id: string; patch: Patch } | { type: "remove"; id: string } | { type: "add"; task: TaskRow }) => {
      if (action.type === "add") return [action.task, ...state];
      if (action.type === "remove") return state.filter((task) => task.id !== action.id);
      return state.map((task) => (task.id === action.id ? { ...task, ...action.patch } : task));
    },
  );
  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { open, done } = useMemo(() => {
    const sorted = [...optimistic].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const aOver = overdue(a, todayYmd);
      const bOver = overdue(b, todayYmd);
      if (aOver !== bOver) return aOver ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
    return {
      open: sorted.filter((task) => !task.done),
      done: sorted.filter((task) => task.done),
    };
  }, [optimistic, todayYmd]);

  const visible = limit ? open.slice(0, limit) : open;
  const hiddenCount = limit ? Math.max(0, open.length - limit) : 0;

  async function send(path: string, init: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; task?: TaskRow; message?: string }
      | null;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.message || "Could not save. Try again.");
    }
    return body;
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    setFailure("");
    const temporary: TaskRow = {
      id: `pending-${Date.now()}`,
      title,
      notes: "",
      done: false,
      priority: "normal",
      area: "company",
      dueDate: null,
      sortOrder: -Date.now(),
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    startTransition(async () => {
      applyOptimistic({ type: "add", task: temporary });
      try {
        const body = await send(endpoint(accessKey), {
          method: "POST",
          body: JSON.stringify({ title }),
        });
        if (body.task) setServerTasks((current) => [body.task!, ...current]);
      } catch (problem) {
        setFailure(problem instanceof Error ? problem.message : "Could not save.");
        setDraft(title);
      }
    });
    inputRef.current?.focus();
  }

  function patch(id: string, next: Patch) {
    setFailure("");
    startTransition(async () => {
      applyOptimistic({ type: "patch", id, patch: next });
      try {
        const body = await send(endpoint(accessKey, id), {
          method: "PATCH",
          body: JSON.stringify(next),
        });
        if (body.task) {
          setServerTasks((current) =>
            current.map((task) => (task.id === id ? body.task! : task)),
          );
        }
      } catch (problem) {
        setFailure(problem instanceof Error ? problem.message : "Could not save.");
      }
    });
  }

  function remove(id: string) {
    setFailure("");
    setOpenId(null);
    startTransition(async () => {
      applyOptimistic({ type: "remove", id });
      try {
        await send(endpoint(accessKey, id), { method: "DELETE" });
        setServerTasks((current) => current.filter((task) => task.id !== id));
      } catch (problem) {
        setFailure(problem instanceof Error ? problem.message : "Could not delete.");
      }
    });
  }

  return (
    <Panel
      title={title}
      action={
        <span className="text-xs text-muted-foreground">
          {open.length} open{done.length ? ` · ${done.length} done` : ""}
        </span>
      }
    >
      <form className="flex items-center gap-2 px-3 pb-3" onSubmit={add}>
        <Input
          aria-label="New task"
          className="min-h-11 flex-1 md:min-h-9"
          disabled={Boolean(error)}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a task…"
          ref={inputRef}
          value={draft}
        />
        <Button
          aria-label="Add task"
          className="size-11 shrink-0 md:size-9"
          disabled={!draft.trim() || Boolean(error)}
          size="icon"
          type="submit"
          variant="brand"
        >
          <PlusIcon className="size-5" />
        </Button>
      </form>

      {error ? (
        <p className="border-t border-border px-3 py-3 text-xs text-destructive">{error}</p>
      ) : null}
      {failure ? (
        <p className="border-t border-border px-3 py-2 text-xs text-destructive" role="alert">
          {failure}
        </p>
      ) : null}

      {!error && !open.length && !done.length ? (
        <p className="border-t border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Nothing on the list. Add the next thing you need to do.
        </p>
      ) : null}

      {visible.map((task) => (
        <TaskItem
          key={task.id}
          expanded={openId === task.id}
          onDelete={() => remove(task.id)}
          onPatch={(next) => patch(task.id, next)}
          onToggleExpanded={() => setOpenId((current) => (current === task.id ? null : task.id))}
          pending={pending}
          task={task}
          todayYmd={todayYmd}
        />
      ))}

      {hiddenCount > 0 && moreHref ? (
        <Link
          className="flex min-h-11 items-center justify-center border-t border-border text-sm font-semibold text-brand"
          href={routeHref(moreHref)}
        >
          {hiddenCount} more open
        </Link>
      ) : null}

      {!limit && done.length ? (
        <details className="border-t border-border">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Done ({done.length})
          </summary>
          {done.map((task) => (
            <TaskItem
              key={task.id}
              expanded={openId === task.id}
              onDelete={() => remove(task.id)}
              onPatch={(next) => patch(task.id, next)}
              onToggleExpanded={() => setOpenId((current) => (current === task.id ? null : task.id))}
              pending={pending}
              task={task}
              todayYmd={todayYmd}
            />
          ))}
        </details>
      ) : null}
    </Panel>
  );
}

function TaskItem({
  task,
  todayYmd,
  expanded,
  pending,
  onPatch,
  onDelete,
  onToggleExpanded,
}: {
  task: TaskRow;
  todayYmd: string;
  expanded: boolean;
  pending: boolean;
  onPatch: (patch: Patch) => void;
  onDelete: () => void;
  onToggleExpanded: () => void;
}) {
  const due = dueLabel(task, todayYmd);
  const isOverdue = overdue(task, todayYmd);

  return (
    <div className="border-t border-border">
      <div className="flex items-center gap-3 px-3 py-1.5">
        <button
          aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          aria-pressed={task.done}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/20 transition-colors",
            task.done && "bg-brand-gradient ring-0",
          )}
          disabled={pending}
          onClick={() => onPatch({ done: !task.done })}
          type="button"
        >
          {task.done ? <CheckIcon className="size-4 text-brand-foreground" /> : null}
        </button>

        <button
          aria-expanded={expanded}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onToggleExpanded}
          type="button"
        >
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-sm font-medium",
                task.done && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </span>
            {due || task.area !== "company" ? (
              <span
                className={cn(
                  "mt-0.5 block truncate text-xs",
                  isOverdue ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {[due, task.area === "company" ? null : TASK_AREA_LABELS[task.area]]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null}
          </span>
          {task.priority === "high" && !task.done ? <Pill tone="warn">High</Pill> : null}
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 bg-muted/40 px-3 py-3">
          <Input
            aria-label="Task title"
            className="min-h-11 md:min-h-9"
            defaultValue={task.title}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== task.title) onPatch({ title: value });
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarIcon className="size-4" />
              <input
                aria-label="Due date"
                className="min-h-9 rounded-lg bg-card px-2 text-xs text-foreground ring-1 ring-foreground/15"
                defaultValue={task.dueDate ?? ""}
                onChange={(event) => onPatch({ dueDate: event.target.value || null })}
                type="date"
              />
            </label>
            <select
              aria-label="Area"
              className="min-h-9 rounded-lg bg-card px-2 text-xs ring-1 ring-foreground/15"
              onChange={(event) => onPatch({ area: event.target.value as TaskArea })}
              value={task.area}
            >
              {TASK_AREAS.map((area) => (
                <option key={area} value={area}>
                  {TASK_AREA_LABELS[area]}
                </option>
              ))}
            </select>
            <select
              aria-label="Priority"
              className="min-h-9 rounded-lg bg-card px-2 text-xs ring-1 ring-foreground/15"
              onChange={(event) => onPatch({ priority: event.target.value as TaskRow["priority"] })}
              value={task.priority}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
            <Button
              className="ml-auto min-h-9 text-destructive"
              onClick={onDelete}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Work the dashboard found for you, as opposed to work you wrote down. Read
 * only on purpose: each row links to the place the job actually gets done.
 */
export function ActionQueue({
  actions,
  limit,
  title = "Needs attention",
}: {
  actions: ActionItem[];
  limit?: number;
  title?: string;
}) {
  const visible = limit ? actions.slice(0, limit) : actions;
  return (
    <Panel
      title={title}
      action={
        actions.length ? (
          <span className="text-xs text-muted-foreground">{actions.length}</span>
        ) : null
      }
    >
      {visible.length ? (
        visible.map((action) => (
          <Row
            key={action.id}
            external={Boolean(action.href?.startsWith("http"))}
            href={action.href}
            primary={action.title}
            secondary={action.detail}
            badge={
              action.tone === "warn" ? (
                <Pill tone="warn">Now</Pill>
              ) : action.tone === "brand" ? (
                <Pill tone="brand">Soon</Pill>
              ) : undefined
            }
          />
        ))
      ) : (
        <p className="border-t border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Nothing needs attention. Receipts, drafts and tax dates are all clear.
        </p>
      )}
    </Panel>
  );
}
