import { TikTokPage } from "@/components/os/tiktok-page";
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

function sampleTasks(today: string): TaskRow[] {
  return [
    {
      id: "video-1",
      title: "Night drive piano clip",
      notes:
        "Dashboard cam + soft LED wash. Cap at 28 seconds.\nhttps://www.tiktok.com/@friqtao/video/7550123456789012345",
      list: "video",
      song: "Midnight Hours",
      tiktokSearchedAt: "2026-09-05T18:00:00.000Z",
      done: false,
      inProgress: true,
      status: "in_progress",
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
  ];
}

export default function DashMockTikTokPage() {
  const today = todayYmd();
  return (
    <TikTokPage
      accessKey="mock"
      localOnly
      snapshot={{
        company: { name: "Mock", vat: "", owner: "" },
        tasks: sampleTasks(today),
        tasksError: null,
        actions: [],
        upcoming: [],
        sources: [],
        ledger: null,
        ledgerError: null,
        wealth: null,
        spotify: null,
        releases: [],
        connect: [],
      }}
      todayYmd={today}
    />
  );
}
