import assert from "node:assert/strict";
import test from "node:test";

import { compareTaskRows, taskListWhere } from "./task-meta";
import type { TaskRow } from "./types";

function row(partial: Partial<TaskRow> & Pick<TaskRow, "id" | "sortOrder">): TaskRow {
  return {
    title: partial.id,
    notes: "",
    list: "video",
    song: "",
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
    status: "open",
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

  const ordered = [done, later, first, past].sort(compareTaskRows);
  assert.deepEqual(
    ordered.map((task) => task.id),
    ["past", "first", "later", "done"],
  );
});
