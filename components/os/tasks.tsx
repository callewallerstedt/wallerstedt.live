"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArchiveIcon,
  CheckIcon,
  MusicIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  YoutubeIcon,
} from "lucide-react";

import { Panel, Pill, Row } from "@/components/os/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import {
  spotifySearchUrl,
  TASK_AREA_LABELS,
  TASK_AREAS,
  youtubePianoTutorialUrl,
} from "@/lib/os/task-meta";
import type { ActionItem, TaskArea, TaskList as TaskListName, TaskRow } from "@/lib/os/types";
import { cn } from "@/lib/utils";
import { zIndex } from "@/lib/z-index";

type Patch = Partial<
  Pick<TaskRow, "title" | "notes" | "song" | "done" | "area" | "priority" | "dueDate">
> & {
  archived?: boolean;
};

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

function openIdsInOrder(rows: TaskRow[], list: TaskListName) {
  return rows
    .filter((task) => task.list === list && !task.archivedAt && !task.done)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((task) => task.id);
}

function samePrefixOrder(incoming: string[], pending: string[]) {
  return pending.every((id, index) => incoming[index] === id);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function persistableIds(ids: string[]) {
  return ids.filter((id) => UUID_RE.test(id));
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
  localOnly = false,
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
  /** Local mock: keep edits in memory and skip the API. */
  localOnly?: boolean;
}) {
  const [serverTasks, setServerTasks] = useState(tasks.filter((task) => task.list === list));
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
  const localOrderRef = useRef<string[] | null>(null);
  const dragStartOrderRef = useRef<string>("");
  // While a write is in flight, ignore RSC snapshots that still have the old order.
  const pendingOrderRef = useRef<string[] | null>(null);
  const pendingWriteIdsRef = useRef(new Set<string>());
  const addingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [lift, setLift] = useState<{
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  const pointerOriginRef = useRef({ x: 0, y: 0 });
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const [failure, setFailure] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function applyLocalPatch(id: string, next: Patch) {
    setServerTasks((current) =>
      current.map((task) => {
        if (task.id !== id) return task;
        const { archived, ...rest } = next;
        return {
          ...task,
          ...rest,
          ...(archived == null
            ? {}
            : { archivedAt: archived ? new Date().toISOString() : null }),
        };
      }),
    );
  }

  function applyLocalReorder(ids: string[]) {
    setServerTasks((current) => {
      const byId = new Map(current.map((task) => [task.id, task]));
      const reordered = ids
        .map((id, index) => {
          const task = byId.get(id);
          if (!task) return null;
          return { ...task, sortOrder: index };
        })
        .filter((task): task is TaskRow => task != null);
      const rest = current.filter((task) => !ids.includes(task.id));
      return [...reordered, ...rest];
    });
    setLocalOrder(null);
  }

  const { open, done, doneCount, archived } = useMemo(() => {
    const live = serverTasks.filter((task) => !task.archivedAt);
    const stillOpen = (task: TaskRow) => !task.done || task.id === sweepingId;
    // Open vs done first, then the user's order. Overdue stays a visual cue —
    // sorting by it after a drag would yank rows back to the top.
    const sorted = [...live].sort((a, b) => {
      if (stillOpen(a) !== stillOpen(b)) return stillOpen(a) ? -1 : 1;
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
      archived: serverTasks.filter((task) => task.archivedAt),
    };
  }, [localOrder, serverTasks, sweepingId]);

  // Adopt a newer list from the page only when it actually agrees with writes
  // we already applied. Never treat our own API payload as the page snapshot —
  // that made the old RSC list look "new" and snapped rows back after a drop.
  const [seenTasks, setSeenTasks] = useState(tasks);
  if (tasks !== seenTasks) {
    setSeenTasks(tasks);
    const incoming = tasks.filter((task) => task.list === list);
    const pending = pendingOrderRef.current;
    const writes = pendingWriteIdsRef.current;
    const snapshotMissingWrite = [...writes].some(
      (id) => !incoming.some((task) => task.id === id),
    );
    if (pending && !samePrefixOrder(openIdsInOrder(incoming, list), pending)) {
      // Stale snapshot: keep the order we dropped to.
    } else if (snapshotMissingWrite) {
      // Stale RSC payload from before our create/patch landed.
    } else {
      pendingOrderRef.current = null;
      pendingWriteIdsRef.current = new Set();
      setServerTasks(incoming);
    }
  }

  const visible = limit ? open.slice(0, limit) : open;
  const hiddenCount = limit ? Math.max(0, open.length - limit) : 0;
  const liftedTask = lift ? (open.find((task) => task.id === lift.id) ?? null) : null;

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
    if (!title || addingRef.current) return;
    addingRef.current = true;
    setSaving(true);
    setDraft("");
    setFailure("");
    const temporary: TaskRow = {
      id: `pending-${crypto.randomUUID()}`,
      title,
      notes: "",
      list,
      song: "",
      done: false,
      priority: "normal",
      area: "company",
      dueDate: null,
      sortOrder: 0,
      completedAt: null,
      archivedAt: null,
      createdAt: new Date().toISOString(),
    };
    setServerTasks((current) => {
      const bottom = current
        .filter((task) => !task.archivedAt && !task.done)
        .reduce((max, task) => Math.max(max, task.sortOrder), -1);
      return [...current, { ...temporary, sortOrder: bottom + 1 }];
    });
    setJustAddedId(temporary.id);
    window.setTimeout(
      () => setJustAddedId((current) => (current === temporary.id ? null : current)),
      400,
    );
    inputRef.current?.focus();
    if (localOnly) {
      addingRef.current = false;
      setSaving(false);
      return;
    }
    void (async () => {
      try {
        const body = await send(endpoint(accessKey), {
          method: "POST",
          body: JSON.stringify({ title, list }),
        });
        if (body.task) {
          pendingWriteIdsRef.current.add(body.task.id);
          setServerTasks((current) => {
            const existing = current.find((task) => task.id === temporary.id);
            const next = current.map((task) =>
              task.id === temporary.id
                ? { ...body.task!, sortOrder: existing?.sortOrder ?? body.task!.sortOrder }
                : task,
            );
            if (next.some((task) => task.id === body.task!.id)) return next;
            return [...current.filter((task) => task.id !== temporary.id), body.task!];
          });
          setJustAddedId(body.task.id);
          window.setTimeout(
            () => setJustAddedId((current) => (current === body.task!.id ? null : current)),
            400,
          );
        }
      } catch (problem) {
        setServerTasks((current) => current.filter((task) => task.id !== temporary.id));
        setFailure(problem instanceof Error ? problem.message : "Could not save.");
        setDraft(title);
      } finally {
        addingRef.current = false;
        setSaving(false);
      }
    })();
  }

  function patch(id: string, next: Patch) {
    setFailure("");
    applyLocalPatch(id, next);
    if (localOnly) return;
    if (id.startsWith("pending-")) return;
    pendingWriteIdsRef.current.add(id);
    void (async () => {
      try {
        const body = await send(endpoint(accessKey, id), {
          method: "PATCH",
          body: JSON.stringify(next),
        });
        if (body.task) {
          pendingWriteIdsRef.current.add(body.task.id);
          setServerTasks((current) => current.map((task) => (task.id === id ? body.task! : task)));
        }
      } catch (problem) {
        setFailure(problem instanceof Error ? problem.message : "Could not save.");
      }
    })();
  }

  function remove(id: string) {
    setFailure("");
    setOpenId(null);
    setServerTasks((current) => current.filter((task) => task.id !== id));
    if (localOnly) return;
    if (id.startsWith("pending-")) return;
    void (async () => {
      try {
        await send(endpoint(accessKey, id), { method: "DELETE" });
      } catch (problem) {
        setFailure(problem instanceof Error ? problem.message : "Could not delete.");
      }
    })();
  }

  function reorder(ids: string[]) {
    setFailure("");
    const saved = persistableIds(ids);
    pendingOrderRef.current = saved.length ? saved : ids;
    applyLocalReorder(ids);
    if (localOnly) {
      pendingOrderRef.current = null;
      return;
    }
    if (!saved.length) return;
    void (async () => {
      try {
        const response = await fetch(endpoint(accessKey), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: saved, list }),
        });
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; tasks?: TaskRow[]; message?: string }
          | null;
        if (!response.ok || !body?.ok || !body.tasks) {
          throw new Error(body?.message || "Could not save the new order.");
        }
        const next = body.tasks.filter((task) => task.list === list);
        setServerTasks((current) => {
          const byId = new Map(next.map((task) => [task.id, task]));
          return current.map((task) => {
            const savedRow = byId.get(task.id);
            if (!savedRow) return task;
            return { ...savedRow, sortOrder: task.sortOrder };
          });
        });
      } catch (problem) {
        pendingOrderRef.current = persistableIds(dragStartOrderRef.current.split(","));
        const start = persistableIds(dragStartOrderRef.current.split(","));
        if (start.length) applyLocalReorder(start);
        setFailure(problem instanceof Error ? problem.message : "Could not reorder.");
      }
    })();
  }

  // The lifted card tracks the pointer on the element itself (no React render
  // per move). The ghost snaps to whichever slot is closest to the preview.
  useEffect(() => {
    if (!dragId) return;
    let frame = 0;
    let latestY = 0;

    function applyMove() {
      frame = 0;
      const previewBox = liftRef.current?.getBoundingClientRect();
      const previewCenter = previewBox
        ? previewBox.top + previewBox.height / 2
        : latestY;

      setLocalOrder((current) => {
        if (!current) return current;
        const from = current.indexOf(dragId!);
        if (from < 0) return current;

        let bestIndex = from;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let index = 0; index < current.length; index++) {
          const element = rowRefs.current.get(current[index]!);
          if (!element) continue;
          const box = element.getBoundingClientRect();
          const mid = box.top + box.height / 2;
          const dist = Math.abs(previewCenter - mid);
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = index;
          }
        }

        // Stay put unless another slot is clearly closer — stops mid-gap flicker.
        const currentElement = rowRefs.current.get(dragId!);
        if (currentElement && bestIndex !== from) {
          const box = currentElement.getBoundingClientRect();
          const currentDist = Math.abs(previewCenter - (box.top + box.height / 2));
          if (bestDist >= currentDist - 4) return current;
        }

        if (bestIndex === from) return current;
        const next = [...current];
        next.splice(bestIndex, 0, ...next.splice(from, 1));
        localOrderRef.current = next;
        return next;
      });
    }

    function move(event: PointerEvent) {
      if (event.cancelable) event.preventDefault();
      const origin = pointerOriginRef.current;
      const node = liftRef.current;
      if (node) {
        node.style.transform = `translate3d(${event.clientX - origin.x}px, ${event.clientY - origin.y}px, 0)`;
      }
      latestY = event.clientY;
      if (!frame) frame = window.requestAnimationFrame(applyMove);
    }

    function up() {
      if (frame) window.cancelAnimationFrame(frame);
      // Final snap to the closest slot using the preview's last position.
      applyMove();
      const order = localOrderRef.current;
      setDragId(null);
      setLift(null);
      localOrderRef.current = null;
      if (order && order.join() !== dragStartOrderRef.current) reorder(order);
      else setLocalOrder(null);
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  function sweep(id: string) {
    setSweepingId(id);
    window.setTimeout(() => {
      setSweepingId((current) => (current === id ? null : current));
      setOpenId((current) => (current === id ? null : current));
    }, 1300);
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
      onGrab: (event: ReactPointerEvent<HTMLElement>) => {
        const row = rowRefs.current.get(task.id);
        if (!row) return;
        const box = row.getBoundingClientRect();
        const order = open.map((rowItem) => rowItem.id);
        localOrderRef.current = order;
        dragStartOrderRef.current = order.join();
        pointerOriginRef.current = { x: event.clientX, y: event.clientY };
        setLift({
          id: task.id,
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        });
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
      task,
      todayYmd,
    };
  }

  return (
    <Panel
      title={title}
      action={
        <span className="text-xs text-muted-foreground">
          {serverTasks.filter((task) => !task.archivedAt).length - doneCount} open
          {doneCount ? ` · ${doneCount} done` : ""}
        </span>
      }
    >
      <form className="flex items-center gap-2 px-3 pb-3" onSubmit={add}>
        <Input
          aria-label="New task"
          className="min-h-11 flex-1 md:min-h-9"
          disabled={saving || Boolean(error)}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={addPlaceholder}
          ref={inputRef}
          value={draft}
        />
        <Button
          aria-label="Add task"
          className="size-11 shrink-0 md:size-9"
          disabled={saving || !draft.trim() || Boolean(error)}
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

      {visible.length ? (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {visible.map((task, index) =>
            lift && task.id === lift.id ? (
              <div
                aria-hidden
                className="os-task-ghost rounded-[1.25rem]"
                key={task.id}
                ref={(element) => {
                  if (element) rowRefs.current.set(task.id, element);
                  else rowRefs.current.delete(task.id);
                }}
                style={{ height: lift.height }}
              />
            ) : (
              <TaskItem key={task.id} rank={index + 1} {...itemProps(task)} />
            ),
          )}
        </div>
      ) : null}

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
          <div className="flex flex-col gap-1 px-2 pb-2">
            {(limit ? done.slice(0, 5) : done).map((task) => (
              <TaskItem key={task.id} {...itemProps(task)} />
            ))}
          </div>
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

      {lift && liftedTask
        ? createPortal(
            <div
              className="os-task-lift"
              ref={liftRef}
              style={{
                left: lift.left,
                top: lift.top,
                width: lift.width,
              }}
            >
              <TaskItem
                {...itemProps(liftedTask)}
                dragging
                floating
                rank={Math.max(1, (localOrder ?? visible.map((row) => row.id)).indexOf(lift.id) + 1)}
                registerRow={() => {}}
              />
            </div>,
            document.querySelector(".os-root") ?? document.body,
          )
        : null}

    </Panel>
  );
}

/**
 * Action menu on a video idea: Spotify for the track, or YouTube for a piano
 * tutorial of the same song.
 */
function SongSearchMenu({ query }: { query: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const box = buttonRef.current?.getBoundingClientRect();
    if (box) setPos({ top: box.bottom + 4, left: box.left });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Find ${query} on Spotify or YouTube`}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground ring-1 ring-foreground/12 hover:text-brand"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        ref={buttonRef}
        title="Find song"
        type="button"
      >
        <MusicIcon className="size-3.5" />
      </button>
      {open
        ? createPortal(
            <div
              className="min-w-[11.5rem] overflow-hidden rounded-lg bg-card py-1 shadow-lg ring-1 ring-foreground/15"
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                zIndex: zIndex.overlay,
              }}
            >
              <a
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                href={spotifySearchUrl(query)}
                onClick={(event) => event.stopPropagation()}
                rel="noreferrer"
                role="menuitem"
                target="_blank"
              >
                <MusicIcon className="size-3.5 text-muted-foreground" />
                Spotify
              </a>
              <a
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                href={youtubePianoTutorialUrl(query)}
                onClick={(event) => event.stopPropagation()}
                rel="noreferrer"
                role="menuitem"
                target="_blank"
              >
                <YoutubeIcon className="size-3.5 text-muted-foreground" />
                YouTube tutorial
              </a>
            </div>,
            document.querySelector(".os-root") ?? document.body,
          )
        : null}
    </>
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
  celebrating,
  dragging,
  floating = false,
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
  celebrating: boolean;
  dragging: boolean;
  floating?: boolean;
  justAdded: boolean;
  rank?: number;
  showSong: boolean;
  registerRow: (element: HTMLElement | null) => void;
  onArchive: () => void;
  onCelebrate: () => void;
  onGrab: (event: ReactPointerEvent<HTMLElement>) => void;
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
  // Keep open-row size while the accent sweep plays — otherwise the done
  // styles shrink the card mid-animation.
  const appearOpen = !task.done || celebrating;

  function onPointerDown(event: React.PointerEvent) {
    if (editing || floating) return;
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
        "os-task-row relative overflow-hidden rounded-[1.25rem] ring-1 ring-foreground/10",
        floating ? "bg-card" : "bg-background/60",
        justAdded && "os-pop-in",
        dragging && !floating && !celebrating && "bg-card shadow-lg ring-brand/40",
      )}
      data-celebrate={celebrating ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
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
          "relative flex items-center gap-2 px-2 touch-pan-y",
          floating ? "bg-card" : "bg-card/80",
          appearOpen ? "py-1.5" : "py-1",
          dragX === 0 && "motion-safe:transition-transform motion-safe:duration-200",
        )}
        onPointerCancel={endDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        style={{ transform: dragX ? `translate3d(${dragX}px,0,0)` : undefined }}
      >
        {rank != null && appearOpen ? (
          <button
            aria-label={`Reorder ${task.title}, currently number ${rank}`}
            className={cn(
              "flex h-8 w-3.5 shrink-0 touch-none items-center justify-center",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
            onPointerDown={(event) => {
              // Only a primary press starts a drag; a right-click must not.
              if (event.button !== 0 || floating) return;
              event.preventDefault();
              event.stopPropagation();
              onGrab(event);
            }}
            title="Drag to reprioritise"
            type="button"
          >
            <span
              aria-hidden
              className="inline-grid grid-cols-2 gap-x-[3px] gap-y-[2px]"
            >
              {Array.from({ length: 8 }, (_, index) => (
                <span
                  key={index}
                  className="size-[2px] rounded-full bg-muted-foreground/55"
                />
              ))}
            </span>
          </button>
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden />
        )}

        {showSong ? <SongSearchMenu query={task.song || task.title} /> : null}

        <button
          aria-expanded={expanded}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 text-left",
            appearOpen ? "min-h-9" : "min-h-7",
          )}
          onClick={toggle}
          type="button"
        >
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate font-medium",
                appearOpen ? "text-sm" : "text-[13px] text-muted-foreground/70",
              )}
            >
              {task.title}
            </span>
            {summary && appearOpen ? (
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
          {task.priority === "high" && appearOpen ? <Pill tone="warn">High</Pill> : null}
        </button>

        <button
          aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          aria-pressed={task.done}
          className="-m-1 flex shrink-0 touch-manipulation p-1"
          onClick={() => {
            if (!task.done) onCelebrate();
            onPatch({ done: !task.done });
          }}
          type="button"
        >
          <span
            className={cn(
              "os-task-check flex size-5 items-center justify-center rounded-full ring-1 ring-foreground/25 transition-colors",
              task.done && "bg-brand-gradient ring-0",
            )}
          >
            {task.done ? (
              <CheckIcon className="size-3.5 text-brand-foreground" strokeWidth={3} />
            ) : null}
          </span>
        </button>
      </div>

      {expanded && !editing ? (
        <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/40 px-3 pt-2 pb-2.5">
          <div className="flex items-start gap-2">
            <p
              className={cn(
                "os-task-note min-w-0 flex-1 rounded-md px-2.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ring-1 ring-foreground/10",
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
        <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/40 px-3 pt-2 pb-3">
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
