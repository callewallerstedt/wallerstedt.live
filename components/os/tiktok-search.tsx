"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCwIcon, XIcon } from "lucide-react";

import { OsSpinner } from "@/components/os/loader";
import { TikTokCover } from "@/components/os/tiktok-cover";
import { tiktokPianoSearchQuery, tiktokPianoSearchUrl } from "@/lib/os/task-meta";
import { formatTikTokCount, type TikTokSearchResult } from "@/lib/os/tiktok-search";
import { zIndex } from "@/lib/z-index";

type SearchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; results: TikTokSearchResult[]; cached: boolean; searchedAt: string | null };

function searchEndpoint(accessKey: string, taskId?: string) {
  const path = `/api/os/${encodeURIComponent(accessKey)}/tiktok/search`;
  return taskId ? `${path}?taskId=${encodeURIComponent(taskId)}` : path;
}

export function TikTokSearchDialog({
  accessKey,
  localOnly = false,
  onClose,
  onSaved,
  songQuery,
  taskId,
}: {
  accessKey: string;
  localOnly?: boolean;
  onClose: () => void;
  onSaved?: (searchedAt: string) => void;
  /** Raw `task.song || task.title` — piano is appended here. */
  songQuery: string;
  /** Persist results against this CompanyTask when it is a real UUID. */
  taskId?: string;
}) {
  const query = tiktokPianoSearchQuery(songQuery);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<SearchState>({ status: "loading" });
  const [mounted, setMounted] = useState(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (localOnly) {
      setState({
        status: "error",
        message: "TikTok search needs the signed-in dashboard, not the local mock.",
      });
      return;
    }

    const controller = new AbortController();
    const refresh = refreshNonce > 0;
    setState({ status: "loading" });

    void (async () => {
      try {
        if (taskId && !refresh) {
          const cachedResponse = await fetch(searchEndpoint(accessKey, taskId), {
            signal: controller.signal,
          });
          const cachedBody = (await cachedResponse.json().catch(() => null)) as
            | {
                ok?: boolean;
                cached?: boolean;
                results?: TikTokSearchResult[];
                searchedAt?: string;
                message?: string;
              }
            | null;
          if (
            cachedResponse.ok &&
            cachedBody?.ok &&
            cachedBody.cached &&
            Array.isArray(cachedBody.results)
          ) {
            if (!controller.signal.aborted) {
              setState({
                status: "ready",
                results: cachedBody.results,
                cached: true,
                searchedAt: cachedBody.searchedAt ?? null,
              });
            }
            return;
          }
        }

        const response = await fetch(searchEndpoint(accessKey), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: query,
            limit: 15,
            ...(taskId ? { taskId, refresh } : {}),
          }),
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              cached?: boolean;
              results?: TikTokSearchResult[];
              searchedAt?: string | null;
              message?: string;
            }
          | null;
        if (!response.ok || !body?.ok || !Array.isArray(body.results)) {
          throw new Error(body?.message || "Could not search TikTok. Try again.");
        }
        if (!controller.signal.aborted) {
          const searchedAt = body.searchedAt ?? null;
          setState({
            status: "ready",
            results: body.results,
            cached: body.cached === true,
            searchedAt,
          });
          if (searchedAt) onSavedRef.current?.(searchedAt);
        }
      } catch (problem) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: problem instanceof Error ? problem.message : "Could not search TikTok.",
        });
      }
    })();

    return () => controller.abort();
  }, [accessKey, localOnly, query, refreshNonce, taskId]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="presentation"
      style={{ zIndex: zIndex.overlay }}
    >
      <div
        aria-labelledby="tiktok-search-title"
        aria-modal="true"
        className="os-pop-in flex max-h-[92dvh] w-full max-w-[28rem] flex-col overflow-hidden rounded-t-2xl bg-card ring-1 ring-foreground/10 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold" id="tiktok-search-title">
              TikTok piano covers
            </p>
            <p className="truncate text-xs text-muted-foreground">{query}</p>
            {state.status === "ready" && state.cached ? (
              <p className="mt-0.5 text-[0.7rem] font-medium text-emerald-600 dark:text-emerald-400">
                Saved search — opened without calling Treg
              </p>
            ) : null}
          </div>
          {taskId && !localOnly ? (
            <button
              aria-label="Refresh TikTok search"
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-foreground ring-1 ring-foreground/15 hover:bg-muted disabled:opacity-50"
              disabled={state.status === "loading"}
              onClick={() => setRefreshNonce((current) => current + 1)}
              type="button"
            >
              <RefreshCwIcon className="size-3.5" />
              Refresh
            </button>
          ) : null}
          <button
            aria-label="Close"
            className="shrink-0 p-1 text-muted-foreground"
            onClick={onClose}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="min-h-40 overflow-y-auto">
          {state.status === "loading" ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12" role="status">
              <OsSpinner size={28} />
              <p className="text-xs text-muted-foreground">
                {refreshNonce > 0 ? "Refreshing TikTok…" : "Searching TikTok…"}
              </p>
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="flex flex-col items-start gap-3 px-3 py-6" role="alert">
              <p className="text-sm text-destructive">{state.message}</p>
              <div className="flex flex-wrap items-center gap-3">
                {localOnly ? null : (
                  <button
                    className="text-xs font-semibold text-brand"
                    onClick={() => setRefreshNonce((current) => current + 1)}
                    type="button"
                  >
                    Try again
                  </button>
                )}
                <a
                  className="text-xs font-semibold text-brand"
                  href={tiktokPianoSearchUrl(songQuery)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Search on TikTok instead
                </a>
              </div>
            </div>
          ) : null}

          {state.status === "ready" && !state.results.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No piano covers found for this search.
            </p>
          ) : null}

          {state.status === "ready" && state.results.length ? (
            <ol className="flex flex-col">
              {state.results.map((item, index) => (
                <TikTokResultRow item={item} key={item.awemeId} rank={index + 1} />
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </div>,
    document.querySelector(".os-root") ?? document.body,
  );
}

export function TikTokResultRow({ item, rank }: { item: TikTokSearchResult; rank: number }) {
  return (
    <li className="flex items-center gap-2.5 border-t border-border px-3 py-2 first:border-t-0">
      <span className="w-4 shrink-0 text-center text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
        {rank}
      </span>
      <TikTokCover src={item.coverUrl} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium">
          {item.song || item.desc || `Piano cover by @${item.uniqueId}`}
        </p>
        <p className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">
          @{item.uniqueId}
          {" · "}
          {formatTikTokCount(item.playCount)} views
          {" · "}
          {formatTikTokCount(item.diggCount)} likes
        </p>
      </div>
      <a
        className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand ring-1 ring-foreground/15 hover:bg-muted"
        href={item.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        Open
      </a>
    </li>
  );
}
