"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { OsSpinner } from "@/components/os/loader";
import { EmptyState, Panel, SectionLabel } from "@/components/os/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/os/format";
import {
  WEEKLY_PIANO_TIKTOK_WATCH,
  type TikTokScanPayload,
  type TikTokScanVideo,
  type TikTokWatchAccount,
} from "@/lib/os/tiktok-scan";
import { formatTikTokCount } from "@/lib/os/tiktok-search";

function watchEndpoint(accessKey: string, suffix = "") {
  return `/api/os/${encodeURIComponent(accessKey)}/tiktok/watch${suffix}`;
}

function scanDate(iso: string) {
  const ymd = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? formatDate(ymd) : iso;
}

export function TikTokScanTools({
  accessKey,
  localOnly = false,
}: {
  accessKey: string;
  localOnly?: boolean;
}) {
  const [accounts, setAccounts] = useState<TikTokWatchAccount[]>([]);
  const [lastScan, setLastScan] = useState<TikTokScanPayload | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(!localOnly);
  const [scanning, setScanning] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (localOnly) {
      setAccounts([
        { id: "seed-1", handle: "friqtao", uniqueId: "friqtao", nickname: "", sortOrder: 0 },
        { id: "seed-2", handle: "alejs_tunes", uniqueId: "alejs_tunes", nickname: "", sortOrder: 1 },
      ]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(watchEndpoint(accessKey), { signal: controller.signal });
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; accounts?: TikTokWatchAccount[]; lastScan?: TikTokScanPayload | null; message?: string }
          | null;
        if (!response.ok || !body?.ok || !Array.isArray(body.accounts)) {
          throw new Error(body?.message || "Could not load watched accounts.");
        }
        if (!controller.signal.aborted) {
          setAccounts(body.accounts);
          setLastScan(body.lastScan ?? null);
        }
      } catch (problem) {
        if (controller.signal.aborted) return;
        setFailure(problem instanceof Error ? problem.message : "Could not load watched accounts.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [accessKey, localOnly]);

  async function send(path: string, init: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const body = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          accounts?: TikTokWatchAccount[];
          lastScan?: TikTokScanPayload;
          message?: string;
        }
      | null;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.message || "Could not save. Try again.");
    }
    return body;
  }

  function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handle = draft.trim();
    if (!handle) return;
    setFailure("");
    if (localOnly) {
      const normalized = handle.replace(/^@+/, "").toLowerCase();
      setAccounts((current) =>
        current.some((account) => account.handle === normalized)
          ? current
          : [
              ...current,
              {
                id: `local-${normalized}`,
                handle: normalized,
                uniqueId: normalized,
                nickname: "",
                sortOrder: current.length,
              },
            ],
      );
      setDraft("");
      return;
    }
    void (async () => {
      try {
        const body = await send(watchEndpoint(accessKey), {
          method: "POST",
          body: JSON.stringify({ handle }),
        });
        if (body.accounts) setAccounts(body.accounts);
        setDraft("");
      } catch (problem) {
        setFailure(problem instanceof Error ? problem.message : "Could not add that account.");
      }
    })();
  }

  function removeAccount(id: string) {
    setFailure("");
    if (localOnly) {
      setAccounts((current) => current.filter((account) => account.id !== id));
      return;
    }
    void (async () => {
      try {
        const body = await send(watchEndpoint(accessKey, `/${id}`), { method: "DELETE" });
        if (body.accounts) setAccounts(body.accounts);
      } catch (problem) {
        setFailure(problem instanceof Error ? problem.message : "Could not remove that account.");
      }
    })();
  }

  function scanNow() {
    setFailure("");
    if (localOnly) {
      setFailure("Scan now needs the signed-in dashboard, not the local mock.");
      return;
    }
    setScanning(true);
    void (async () => {
      try {
        const body = await send(watchEndpoint(accessKey, "/scan"), { method: "POST" });
        if (body.lastScan) setLastScan(body.lastScan);
      } catch (problem) {
        setFailure(problem instanceof Error ? problem.message : "Scan failed.");
      } finally {
        setScanning(false);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Scan tools</SectionLabel>
      <Panel
        title="Watched accounts"
        footer="Seeded with @friqtao and @alejs_tunes. Scan pulls each profile and their latest videos through Treg."
        action={
          <Button disabled={scanning || loading || !accounts.length} onClick={scanNow} size="sm" variant="brand">
            {scanning ? "Scanning…" : "Scan now"}
          </Button>
        }
      >
        <form className="flex items-center gap-2 px-3 pb-3" onSubmit={addAccount}>
          <Input
            aria-label="TikTok handle"
            className="min-h-11 flex-1 md:min-h-9"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add @handle…"
            value={draft}
          />
          <Button
            aria-label="Watch account"
            className="size-11 shrink-0 md:size-9"
            disabled={!draft.trim()}
            size="icon"
            type="submit"
            variant="outline"
          >
            <PlusIcon className="size-4" />
          </Button>
        </form>
        {failure ? (
          <p className="border-t border-border px-3 py-2 text-xs text-destructive" role="alert">
            {failure}
          </p>
        ) : null}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <OsSpinner size={22} />
          </div>
        ) : accounts.length ? (
          <ul>
            {accounts.map((account) => (
              <li
                className="flex items-center gap-2 border-t border-border px-3 py-2"
                key={account.id}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  @{account.handle}
                  {account.nickname && account.nickname !== account.handle ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {account.nickname}
                    </span>
                  ) : null}
                </span>
                <button
                  aria-label={`Stop watching @${account.handle}`}
                  className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                  onClick={() => removeAccount(account.id)}
                  type="button"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No accounts yet" detail="Add a handle to scan piano covers." />
        )}
      </Panel>

      <Panel
        title="Weekly digest"
        footer={`Monday 09:00 Berlin · ${WEEKLY_PIANO_TIKTOK_WATCH}. Last scan is stored here for that routine.`}
      >
        {lastScan ? (
          <div className="px-3 py-2.5 text-sm">
            <p className="font-medium">Last scan · {scanDate(lastScan.scannedAt)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Week {lastScan.weekKey || "—"}
              {lastScan.accounts.length
                ? ` · ${lastScan.accounts.map((account) => `@${account.handle}`).join(", ")}`
                : ""}
            </p>
          </div>
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            No scan stored yet. Run Scan now — Max’s Monday routine will read this same list.
          </p>
        )}
      </Panel>

      {scanning ? (
        <div className="flex items-center justify-center gap-2 py-8" role="status">
          <OsSpinner size={26} />
          <p className="text-xs text-muted-foreground">Scanning watched accounts…</p>
        </div>
      ) : null}

      {lastScan ? (
        <div className="grid gap-2 lg:grid-cols-3">
          <ScanRankList title="Top all-time" videos={lastScan.allTime} hint="From the latest posts Treg returned" />
          <ScanRankList title="Last 7 days" videos={lastScan.last7} hint="Ranked by views, then likes" />
          <ScanRankList title="Last 30 days" videos={lastScan.last30} hint="Ranked by views, then likes" />
        </div>
      ) : null}
    </div>
  );
}

function ScanRankList({
  title,
  videos,
  hint,
}: {
  title: string;
  videos: TikTokScanVideo[];
  hint: string;
}) {
  return (
    <Panel title={title} footer={hint}>
      {videos.length ? (
        <ol>
          {videos.map((video, index) => (
            <li
              className="flex items-start gap-2 border-t border-border px-3 py-2 first:border-t-0"
              key={`${video.awemeId}-${video.handle}`}
            >
              <span className="w-4 shrink-0 pt-0.5 text-center text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13px] leading-snug font-medium">
                  {video.song || video.desc || `Clip by @${video.handle}`}
                </p>
                <p className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">
                  @{video.handle}
                  {" · "}
                  {formatTikTokCount(video.playCount)} views
                  {" · "}
                  {formatTikTokCount(video.diggCount)} likes
                </p>
              </div>
              <a
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand ring-1 ring-foreground/15 hover:bg-muted"
                href={video.url}
                rel="noreferrer"
                target="_blank"
              >
                Open
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-3 py-4 text-sm text-muted-foreground">Nothing in this window yet.</p>
      )}
    </Panel>
  );
}
