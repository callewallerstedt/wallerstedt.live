"use client";

import { TaskList } from "@/components/os/tasks";
import { PageFrame, PageTitle } from "@/components/os/ui";
import type { TaskRow } from "@/lib/os/types";

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysFromToday(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildSampleTasks(today: string): TaskRow[] {
  return [
    {
      id: "focus-1",
      title: "Send Q3 invoice reminder to DistroKid",
      notes: "They usually settle within a week once nudged.",
      list: "task",
      song: "",
      done: false,
      priority: "high",
      area: "money",
      dueDate: today,
      sortOrder: 0,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-08-28T09:00:00.000Z",
    },
    {
      id: "focus-2",
      title: "Book studio for autumn session",
      notes: "Prefer Thursday evenings. Check with Lars first.",
      list: "task",
      song: "",
      done: false,
      priority: "normal",
      area: "music",
      dueDate: daysFromToday(3),
      sortOrder: 1,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-08-30T11:20:00.000Z",
    },
    {
      id: "focus-3",
      title: "File missing receipt for Adobe",
      notes: "August Creative Cloud charge — pull from Gmail.",
      list: "task",
      song: "",
      done: false,
      priority: "normal",
      area: "admin",
      dueDate: daysFromToday(-2),
      sortOrder: 2,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-09-01T08:10:00.000Z",
    },
    {
      id: "focus-4",
      title: "Review Avanza allocation",
      notes: "Rebalance KF toward the core holdings after last deposit.",
      list: "task",
      song: "",
      done: false,
      priority: "low",
      area: "money",
      dueDate: daysFromToday(7),
      sortOrder: 3,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-09-02T14:00:00.000Z",
    },
    {
      id: "focus-5",
      title: "Update company address on Skatteverket",
      notes: "",
      list: "task",
      song: "",
      done: true,
      priority: "normal",
      area: "admin",
      dueDate: daysFromToday(-5),
      sortOrder: 4,
      completedAt: "2026-09-03T16:40:00.000Z",
      archivedAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    },
    {
      id: "video-1",
      title: "Night drive piano clip",
      notes: "Dashboard cam + soft LED wash. Cap at 28 seconds.",
      list: "video",
      song: "Midnight Hours",
      done: false,
      priority: "high",
      area: "music",
      dueDate: daysFromToday(1),
      sortOrder: 0,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-09-01T19:00:00.000Z",
    },
    {
      id: "video-2",
      title: "Hands-on keys, rain window",
      notes: "Use the phone mic for room tone; sync to the release master later.",
      list: "video",
      song: "Soft Rain",
      done: false,
      priority: "normal",
      area: "music",
      dueDate: null,
      sortOrder: 1,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-09-02T12:30:00.000Z",
    },
    {
      id: "video-3",
      title: "Before / after mix teaser",
      notes: "Split screen: rough take vs finished master.",
      list: "video",
      song: "Harbour Lights",
      done: false,
      priority: "normal",
      area: "project",
      dueDate: daysFromToday(5),
      sortOrder: 2,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-09-03T09:15:00.000Z",
    },
  ];
}

/** Local-only preview of the overview lists — no auth, no API. */
export function MockOverview() {
  const today = todayYmd();
  const tasks = buildSampleTasks(today);

  return (
    <PageFrame>
      <PageTitle aside="Local mock · edits stay in this tab">Overview</PageTitle>

      <TaskList
        accessKey="mock"
        error={null}
        limit={6}
        localOnly
        tasks={tasks}
        title="Focus"
        todayYmd={today}
      />

      <TaskList
        accessKey="mock"
        addPlaceholder="Add a video idea…"
        emptyLabel="No video ideas yet. Add one when it comes to you."
        error={null}
        limit={5}
        list="video"
        localOnly
        tasks={tasks}
        title="Video ideas"
        todayYmd={today}
      />
    </PageFrame>
  );
}
