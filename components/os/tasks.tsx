"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  GripVerticalIcon,
  MusicIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { Panel, Pill, Row } from "@/components/os/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { spotifySearchUrl, TASK_AREA_LABELS, TASK_AREAS } from "@/lib/os/task-meta";
import type { ActionItem, TaskArea, TaskList as TaskListName, TaskRow } from "@/lib/os/types";
import { cn } from "@/lib/utils";

type Patch = Partial<
  Pick<TaskRow, "title" | "notes" | "song" | "done" | "area" | "priority" | "dueDate">
> & {
  archived?: boolean;
};

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
  // A finished task is never late, whatever its date said.
  if (task.done) return formatDate(task.dueDate);
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
  list = "task",
  emptyLabel = "Nothing on the list. Add the next thing you need to do.",
  addPlaceholder = "Add a task…",
}: {
  accessKey: string;
  tasks: TaskRow[];
  error: string | null;
  todayYmd: string;
  limit?: number;
  moreHref?: string;
  title?: string;
  /** Which list this panel owns. Video ideas get the Spotify shortcut. */
  list?: TaskListName;
  emptyLabel?: string;
  addPlaceholder?: string;
}) {
  const router = useRouter();
  const [serverTasks, setServerTasks] = useState(tasks.filter((task) => task.list === list));
  const [pending, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic(
    serverTasks,
    (state: TaskRow[], action: Action) => {
      if (action.type === "add") return [action.task, ...state];
      if (action.type === "remove") return state.filter((task) => task.id !== action.id);
      return state.map((task) => {
        if (task.id !== action.id) return task;
        const { archived, ...rest } = action.patch;
        return {
          ...task,
          ...rest,
          ...(archived == null
            ? {}
            : { archivedAt: archived ? new Date().toISOString() : null }),
        };
      });
    },
  );
  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  // A row that was just ticked keeps its place in the open list until the
  // accent sweep has played, then moves down into Done. Holding that here
  // rather than in the row survives the row being re-parented.
  const [sweepingId, setSweepingId] = useState<string | null>(null);
  // While a row is being dragged the order is held locally so the list sorts
  // live under the finger; the server is told once, on drop.
  const [dragId, setDragId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  // The drop handler needs the latest order without reading it inside a state
  // updater, which React double-invokes in development and would fire the save
  // twice — the second one landing late and undoing a concurrent change.
  const localOrderRef = useRef<string[] | null>(null);
  const dragStartOrderRef = useRef<string>("");
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const [failure, setFailure] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { open, done, doneCount, archived } = useMemo(() => {
    const live = optimistic.filter((task) => !task.archivedAt);
    const stillOpen = (task: TaskRow) => !task.done || task.id === sweepingId;
    const sorted = [...live].sort((a, b) => {
      if (stillOpen(a) !== stillOpen(b)) return stillOpen(a) ? -1 : 1;
      const aOver = overdue(a, todayYmd);
      const bOver = overdue(b, todayYmd);
      if (aOver !== bOver) return aOver ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
    const openTasks = sorted.filter(stillOpen);
    if (localOrder) {
      const position = new Map(localOrder.map((id, index) => [id, index]));
      openTasks.sort(
        (a, b) =>
          (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (position.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return {
      open: openTasks,
      done: sorted.filter((task) => !stillOpen(task)),
      doneCount: live.filter((task) => task.done).length,
      archived: optimistic.filter((task) => task.archivedAt),
    };
  }, [localOrder, optimistic, sweepingId, todayYmd]);

  // When the server sends a newer list (a refresh, another tab, the agent API)
  // adopt it rather than keeping this component's older copy.
  const [seenTasks, setSeenTasks] = useState(tasks);
  if (tasks !== seenTasks) {
    setSeenTasks(tasks);
    setServerTasks(tasks.filter((task) => task.list === list));
  }

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
      list,
      song: "",
      done: false,
      priority: "normal",
      area: "company",
      dueDate: null,
      sortOrder: -Date.now(),
      completedAt: null,
      archivedAt: null,
      createdAt: new Date().toISOString(),
    };
    startTransition(async () => {
      applyOptimistic({ type: "add", task: temporary });
      try {
        const body = await send(endpoint(accessKey), {
          method: "POST",
          body: JSON.stringify({ title, list }),
        });
        if (body.task) {
          setServerTasks((current) => [body.task!, ...current]);
          setJustAddedId(body.task.id);
          window.setTimeout(
            () => setJustAddedId((current) => (current === body.task!.id ? null : current)),
            400,
          );
        }
        router.refresh();
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
        router.refresh();
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
        router.refresh();
      } catch (problem) {
        setFailure(problem instanceof Error ? problem.message : "Could not delete.");
      }
    });
  }

  function reorder(ids: string[]) {
    setFailure("");
    startTransition(async () => {
      try {
        const response = await fetch(endpoint(accessKey), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, list }),
        });
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; tasks?: TaskRow[]; message?: string }
          | null;
        if (!response.ok || !body?.ok || !body.tasks) {
          throw new Error(body?.message || "Could not save the new order.");
        }
        setServerTasks(body.tasks.filter((task) => task.list === list));
        setSeenTasks(body.tasks);
        setLocalOrder(null);
        router.refresh();
      } catch (problem) {
        setLocalOrder(null);
        setFailure(problem instanceof Error ? problem.message : "Could not reorder.");
      }
    });
  }

  // Dragging is tracked on the window so the pointer can leave the row it
  // started on, which it always does.
  useEffect(() => {
    if (!dragId) return;

    function move(event: PointerEvent) {
      setLocalOrder((current) => {
        if (!current) return current;
        const from = current.indexOf(dragId!);
        if (from < 0) return current;
        let to = from;
        for (const [id, element] of rowRefs.current) {
          const index = current.indexOf(id);
          if (index < 0) continue;
          const box = element.getBoundingClientRect();
          if (event.clientY >= box.top && event.clientY <= box.bottom) {
            to = index;
            break;
          }
        }
        if (to === from) return current;
        const next = [...current];
        next.splice(to, 0, ...next.splice(from, 1));
        localOrderRef.current = next;
        return next;
      });
    }

    function up() {
      setDragId(null);
      const order = localOrderRef.current;
      localOrderRef.current = null;
      // A grip tap that moved nothing should not write anything.
      if (order && order.join() !== dragStartOrderRef.current) reorder(order);
      else setLocalOrder(null);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  function sweep(id: string) {
    setSweepingId(id);
    window.setTimeout(() => setSweepingId((current) => (current === id ? null : current)), 700);
  }

  function itemProps(task: TaskRow) {
    return {
      celebrating: sweepingId === task.id,
      showSong: list === "video",
      dragging: dragId === task.id,
      justAdded: justAddedId === task.id,
      registerRow: (element: HTMLElement | null) => {
        if (element) rowRefs.current.set(task.id, element);
        else rowRefs.current.delete(task.id);
      },
      onGrab: () => {
        const order = open.map((row) => row.id);
        localOrderRef.current = order;
        dragStartOrderRef.current = order.join();
        setLocalOrder(order);
        setDragId(task.id);
      },
      onArchive: () => patch(task.id, { archived: true }),
      onCelebrate: () => sweep(task.id),
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
          {optimistic.filter((task) => !task.archivedAt).length - doneCount} open
          {doneCount ? ` · ${doneCount} done` : ""}
        </span>
      }
    >
      <form className="flex items-center gap-2 px-3 pb-3" onSubmit={add}>
        <Input
          aria-label="New task"
          className="min-h-11 flex-1 md:min-h-9"
          disabled={Boolean(error)}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={addPlaceholder}
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
          {emptyLabel}
        </p>
      ) : null}

      {visible.map((task, index) => (
        <TaskItem key={task.id} rank={index + 1} {...itemProps(task)} />
      ))}

      {hiddenCount > 0 && moreHref ? (
        <Link
          className="flex min-h-11 items-center justify-center border-t border-border text-sm font-semibold text-brand"
          href={routeHref(moreHref)}
        >
          {hiddenCount} more open
        </Link>
      ) : null}

      {done.length ? (
        <>
          <p className="border-t border-border px-3 pt-2 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
            Done
          </p>
          {(limit ? done.slice(0, 5) : done).map((task) => (
            <TaskItem key={task.id} {...itemProps(task)} />
          ))}
        </>
      ) : null}

      {!limit && archived.length ? (
        <details className="border-t border-border">
          <summary className="flex min-h-9 cursor-pointer items-center px-3 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
            Past ({archived.length})
          </summary>
          {archived.map((task) => (
            <div
              className="flex items-center gap-3 border-t border-border px-3 py-1"
              key={task.id}
            >
              <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground/70">
                {task.title}
              </p>
              <button
                className="shrink-0 text-xs font-semibold text-brand"
                onClick={() => patch(task.id, { archived: false })}
                type="button"
              >
                Restore
              </button>
            </div>
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
  celebrating,
  dragging,
  justAdded,
  rank,
  showSong,
  registerRow,
  onArchive,
  onCelebrate,
  onGrab,
  onPatch,
  onDelete,
  onToggleExpanded,
}: {
  task: TaskRow;
  todayYmd: string;
  expanded: boolean;
  pending: boolean;
  celebrating: boolean;
  dragging: boolean;
  justAdded: boolean;
  rank?: number;
  showSong: boolean;
  registerRow: (element: HTMLElement | null) => void;
  onArchive: () => void;
  onCelebrate: () => void;
  onGrab: () => void;
  onPatch: (patch: Patch) => void;
  onDelete: () => void;
  onToggleExpanded: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dragX, setDragX] = useState(0);
  // Distinguishes a horizontal swipe from a vertical scroll, and stops the tap
  // that ends a swipe from also toggling the task.
  const drag = useRef<{ x: number; y: number; axis: "none" | "x" | "y" } | null>(null);
  const swiped = useRef(false);
  const due = dueLabel(task, todayYmd);
  const isOverdue = overdue(task, todayYmd);
  const preview = notesPreview(task.notes);
  const summary = [
    task.song || null,
    due,
    task.area === "company" ? null : TASK_AREA_LABELS[task.area],
    preview || null,
  ]
    .filter(Boolean)
    .join(" · ");

  function toggle() {
    if (swiped.current) return;
    // Collapsing always drops back to the reading view.
    if (expanded) setEditing(false);
    onToggleExpanded();
  }

  const SWIPE_THRESHOLD = 88;

  function onPointerDown(event: React.PointerEvent) {
    if (editing) return;
    drag.current = { x: event.clientX, y: event.clientY, axis: "none" };
    swiped.current = false;
  }

  function onPointerMove(event: React.PointerEvent) {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (start.axis === "none") {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // Let a vertical drag scroll the page instead of swiping the row.
      start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (start.axis === "x") event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (start.axis !== "x") return;
    swiped.current = true;
    setDragX(Math.max(-140, Math.min(0, dx)));
  }

  function endDrag() {
    const shouldArchive = dragX <= -SWIPE_THRESHOLD;
    drag.current = null;
    setDragX(0);
    if (shouldArchive) onArchive();
    // Let the click that ends this gesture pass before re-enabling taps.
    window.setTimeout(() => {
      swiped.current = false;
    }, 0);
  }

  return (
    <div
      className={cn(
        "os-task-row relative overflow-hidden border-t border-border",
        justAdded && "os-pop-in",
        dragging && "z-10 bg-card shadow-lg ring-1 ring-brand/40",
      )}
      data-celebrate={celebrating ? "true" : undefined}
      ref={registerRow}
    >
      {dragX < 0 ? (
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-4 text-xs font-semibold text-muted-foreground"
        >
          <ArchiveIcon
            className={cn("size-4", dragX <= -SWIPE_THRESHOLD && "text-brand")}
          />
          <span className={cn(dragX <= -SWIPE_THRESHOLD && "text-brand")}>
            {dragX <= -SWIPE_THRESHOLD ? "Release" : "Archive"}
          </span>
        </div>
      ) : null}
      <div
        className={cn(
          "relative flex items-center gap-3 bg-card px-3 touch-pan-y",
          task.done ? "py-1" : "py-1.5",
          dragX === 0 && "motion-safe:transition-transform motion-safe:duration-200",
        )}
        onPointerCancel={endDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        style={{ transform: dragX ? `translate3d(${dragX}px,0,0)` : undefined }}
      >
        <button
          aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          aria-pressed={task.done}
          className="-m-1.5 flex shrink-0 touch-manipulation p-1.5"
          disabled={pending}
          onClick={() => {
            if (!task.done) onCelebrate();
            onPatch({ done: !task.done });
          }}
          type="button"
        >
          <span
            className={cn(
              "os-task-check flex size-5 items-center justify-center rounded-md ring-1 ring-foreground/25 transition-colors",
              task.done && "bg-brand-gradient ring-0",
            )}
          >
            {task.done ? (
              <CheckIcon className="size-3.5 text-brand-foreground" strokeWidth={3} />
            ) : null}
          </span>
        </button>

        {rank != null && !task.done ? (
          <button
            aria-label={`Reorder ${task.title}, currently number ${rank}`}
            className={cn(
              "flex w-4 shrink-0 touch-none items-center justify-center text-[0.7rem] font-semibold tabular-nums",
              rank === 1 ? "text-brand" : "text-muted-foreground/60",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
            onPointerDown={(event) => {
              // Only a primary press starts a drag; a right-click must not.
              if (event.button !== 0) return;
              event.preventDefault();
              onGrab();
            }}
            title="Drag to reprioritise"
            type="button"
          >
            {dragging ? <GripVerticalIcon className="size-3.5" /> : rank}
          </button>
        ) : null}

        {showSong ? (
          <a
            aria-label={`Search Spotify for ${task.song || task.title}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground ring-1 ring-foreground/12 hover:text-brand"
            href={spotifySearchUrl(task.song || task.title)}
            onClick={(event) => event.stopPropagation()}
            rel="noreferrer"
            target="_blank"
            title="Find on Spotify"
          >
            <MusicIcon className="size-3.5" />
          </a>
        ) : null}

        <button
          aria-expanded={expanded}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 text-left",
            task.done ? "min-h-8" : "min-h-11",
          )}
          onClick={toggle}
          type="button"
        >
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate font-medium",
                task.done ? "text-[13px] text-muted-foreground/70" : "text-sm",
              )}
            >
              {task.title}
            </span>
            {summary && !task.done ? (
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
        <div className="flex flex-col gap-2 bg-muted/40 px-3 pt-1 pb-2.5">
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
          <p className="text-xs text-muted-foreground">
            <span className={cn("font-medium", isOverdue ? "text-destructive" : "text-foreground")}>
              {due ?? "No due date"}
            </span>
            {" · "}
            {TASK_AREA_LABELS[task.area]}
            {" · "}
            {PRIORITY_LABELS[task.priority]} priority
            {" · added "}
            {formatDate(task.createdAt.slice(0, 10))}
          </p>
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
          {showSong ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Song
              <Input
                className="min-h-11 md:min-h-9"
                defaultValue={task.song}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== task.song) onPatch({ song: value });
                }}
                placeholder="Track the clip is built around"
              />
            </label>
          ) : null}
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
