import { TaskList } from "@/components/os/tasks";
import { TikTokScanTools } from "@/components/os/tiktok-watch";
import { PageFrame, PageTitle } from "@/components/os/ui";
import type { OsSnapshot } from "@/lib/os/types";

export function TikTokPage({
  snapshot,
  accessKey,
  todayYmd,
  localOnly = false,
}: {
  snapshot: OsSnapshot;
  accessKey: string;
  todayYmd: string;
  localOnly?: boolean;
}) {
  return (
    <PageFrame>
      <PageTitle aside="Piano-cover ideas, then the accounts you watch.">TikTok</PageTitle>
      <TaskList
        accessKey={accessKey}
        addPlaceholder="Add a video idea…"
        emptyLabel="No video ideas yet. Add one when it comes to you."
        error={snapshot.tasksError}
        list="video"
        localOnly={localOnly}
        tasks={snapshot.tasks}
        title="Video ideas"
        todayYmd={todayYmd}
      />
      <TikTokScanTools accessKey={accessKey} localOnly={localOnly} />
    </PageFrame>
  );
}
