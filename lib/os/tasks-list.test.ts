import assert from "node:assert/strict";
import test from "node:test";

import { compareTaskRows, enteredVideoPracticing, nextVideoCheckPatch, taskListWhere } from "./task-meta";
import type { TaskRow } from "./types";

function row(partial: Partial<TaskRow> & Pick<TaskRow, "id" | "sortOrder">): TaskRow {
  return {
    title: partial.id,
    notes: "",
    list: "video",
    song: "",
    caption: "",
    done: false,
    priority: "normal",
    area: "music",
    dueDate: null,
    completedAt: null,
    archivedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

test("the agent working list drops Past rows and keeps one list", () => {
  assert.deepEqual(taskListWhere({ list: "video", status: "open", includeArchived: false }), {
    list: "video",
    status: { in: ["open", "in_progress"] },
    archivedAt: null,
  });
});

test("the agent can ask only for ideas that are being practiced", () => {
  assert.deepEqual(taskListWhere({ list: "video", status: "in_progress", includeArchived: false }), {
    list: "video",
    status: "in_progress",
    archivedAt: null,
  });
});

test("the dashboard snapshot still asks for every row", () => {
  assert.deepEqual(taskListWhere(), {});
});

test("video ideas stay in the owner's sort, open ones first", () => {
  const past = row({
    id: "past",
    sortOrder: 0,
    archivedAt: "2026-09-02T00:00:00.000Z",
  });
  const later = row({ id: "later", sortOrder: 2, createdAt: "2026-09-03T00:00:00.000Z" });
  const first = row({ id: "first", sortOrder: 1, createdAt: "2026-09-04T00:00:00.000Z" });
  const done = row({ id: "done", sortOrder: 0, done: true });
  const practicingOlder = row({
    id: "practice-old",
    sortOrder: 1,
    inProgress: true,
    status: "in_progress",
  });
  const practicingNewer = row({
    id: "practice-new",
    sortOrder: 4,
    inProgress: true,
    status: "in_progress",
  });

  const ordered = [done, later, first, past, practicingOlder, practicingNewer].sort(compareTaskRows);
  assert.deepEqual(
    ordered.map((task) => task.id),
    ["practice-new", "practice-old", "past", "first", "later", "done"],
  );
});

test("the video-idea check cycles open → practicing → done → open", () => {
  const open = row({ id: "clip", sortOrder: 0 });
  const practicing = nextVideoCheckPatch(open);
  assert.deepEqual(practicing, { done: false, inProgress: true });
  const done = nextVideoCheckPatch({ ...open, ...practicing });
  assert.deepEqual(done, { done: true, inProgress: false });
  assert.deepEqual(nextVideoCheckPatch({ ...open, ...done }), { done: false, inProgress: false });
});

test("auto-caption runs only when a video idea first enters practicing", () => {
  assert.equal(enteredVideoPracticing("video", "open", "in_progress"), true);
  assert.equal(enteredVideoPracticing("video", "done", "in_progress"), true);
  assert.equal(enteredVideoPracticing("video", "in_progress", "in_progress"), false);
  assert.equal(enteredVideoPracticing("video", "open", "done"), false);
  assert.equal(enteredVideoPracticing("video", "open", undefined), false);
  assert.equal(enteredVideoPracticing("task", "open", "in_progress"), false);
});
