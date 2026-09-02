"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Panel, Pill, Row } from "@/components/os/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { TASK_AREA_LABELS, TASK_AREAS } from "@/lib/os/task-meta";
import type { ActionItem, TaskArea, TaskRow } from "@/lib/os/types";
import { cn } from "@/lib/utils";

type Patch = Partial<Pick<TaskRow, "title" | "notes" | "done" | "area" | "priority" | "dueDate">>;

type Action =
  | { type: "patch"; id: string; patch: Patch }
  | { type: "remove"; id: string }
  | { type: "add"; task: TaskRow };

const PRIORITY_LABELS: Record<TaskRow["priority"], string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

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

/** The first line of a description, for the collapsed row's summary. */
function notesPreview(notes: string) {
  const first = notes.trim().split("\n")[0]?.trim() ?? "";
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
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
    (state: TaskRow[], action: Action) => {
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
          setServerTasks((current) => current.map((task) => (task.id === id ? body.task! : task)));
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

  function itemProps(task: TaskRow) {
    return {
      expanded: openId === task.id,
      onDelete: () => remove(task.id),
      onPatch: (next: Patch) => patch(task.id, next),
      onToggleExpanded: () =>
        setOpenId((current) => (current === task.id ? null : task.id)),
      pending,
      task,
      todayYmd,
    };
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
        <TaskItem key={task.id} {...itemProps(task)} />
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
            <TaskItem key={task.id} {...itemProps(task)} />
          ))}
        </details>
      ) : null}
    </Panel>
  );
}

/**
 * Collapsed it is a single line. Expanded it reads as information — the
 * description and a few facts. The controls only appear behind the pencil, so
 * an open row is never a wall of date pickers and a delete button.
 */
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
  const [editing, setEditing] = useState(false);
  const due = dueLabel(task, todayYmd);
  const isOverdue = overdue(task, todayYmd);
  const preview = notesPreview(task.notes);
  const summary = [due, task.area === "company" ? null : TASK_AREA_LABELS[task.area], preview || null]
    .filter(Boolean)
    .join(" · ");

  function toggle() {
    // Collapsing always drops back to the reading view.
    if (expanded) setEditing(false);
    onToggleExpanded();
  }

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
          onClick={toggle}
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
            {summary ? (
              <span
                className={cn(
                  "mt-0.5 block truncate text-xs",
                  isOverdue ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {summary}
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

      {expanded && !editing ? (
        <div className="flex flex-col gap-3 bg-muted/40 px-3 pt-1 pb-3">
          <div className="flex items-start gap-3">
            <p
              className={cn(
                "min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-wrap",
                task.notes ? "text-foreground/90" : "text-muted-foreground italic",
              )}
            >
              {task.notes || "No description yet."}
            </p>
            <button
              aria-label={`Edit ${task.title}`}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground ring-1 ring-foreground/15 hover:text-foreground"
              onClick={() => setEditing(true)}
              type="button"
              title="Edit"
            >
              <PencilIcon className="size-4" />
            </button>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <Detail label="Due" tone={isOverdue ? "warn" : "default"} value={due ?? "Not set"} />
            <Detail label="Area" value={TASK_AREA_LABELS[task.area]} />
            <Detail label="Priority" value={PRIORITY_LABELS[task.priority]} />
            <Detail label="Added" value={formatDate(task.createdAt.slice(0, 10))} />
          </dl>
        </div>
      ) : null}

      {expanded && editing ? (
        <div className="flex flex-col gap-3 bg-muted/40 px-3 pt-2 pb-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Title
            <Input
              className="min-h-11 md:min-h-9"
              defaultValue={task.title}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== task.title) onPatch({ title: value });
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Description
            <textarea
              className="min-h-20 w-full rounded-lg bg-card px-2.5 py-2 text-sm text-foreground ring-1 ring-foreground/15"
              defaultValue={task.notes}
              onBlur={(event) => {
                if (event.target.value !== task.notes) onPatch({ notes: event.target.value });
              }}
              placeholder="Anything you need to remember about this."
              rows={3}
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Due
              <input
                className="min-h-9 rounded-lg bg-card px-2 text-xs text-foreground ring-1 ring-foreground/15"
                defaultValue={task.dueDate ?? ""}
                onChange={(event) => onPatch({ dueDate: event.target.value || null })}
                type="date"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Area
              <select
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
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Priority
              <select
                className="min-h-9 rounded-lg bg-card px-2 text-xs ring-1 ring-foreground/15"
                onChange={(event) => onPatch({ priority: event.target.value as TaskRow["priority"] })}
                value={task.priority}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button className="min-h-9" onClick={() => setEditing(false)} size="sm" type="button" variant="outline">
              <CheckIcon className="size-4" />
              Done
            </Button>
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

function Detail({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-medium", tone === "warn" && "text-destructive")}>{value}</dd>
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
        actions.length ? <span className="text-xs text-muted-foreground">{actions.length}</span> : null
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
