import { MusicDashboard } from "@/components/os/music";
import type { OsSnapshot } from "@/lib/os/types";

export function MusicPage({ snapshot, todayYmd }: { snapshot: OsSnapshot; todayYmd: string }) {
  return (
    <MusicDashboard
      followers={snapshot.spotify?.followers ?? null}
      releases={snapshot.releases}
      sources={snapshot.sources}
      todayYmd={todayYmd}
    />
  );
}
