"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";

import { OsSpinner } from "@/components/os/loader";
import { tiktokPianoSearchQuery, tiktokPianoSearchUrl } from "@/lib/os/task-meta";
import { formatTikTokCount, type TikTokSearchResult } from "@/lib/os/tiktok-search";
import { zIndex } from "@/lib/z-index";

type SearchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; results: TikTokSearchResult[] };

function searchEndpoint(accessKey: string) {
  return `/api/os/${encodeURIComponent(accessKey)}/tiktok/search`;
}

export function TikTokSearchDialog({
  accessKey,
  localOnly = false,
  onClose,
  songQuery,
}: {
  accessKey: string;
  localOnly?: boolean;
  onClose: () => void;
  /** Raw `task.song || task.title` — piano is appended here. */
  songQuery: string;
}) {
  const query = tiktokPianoSearchQuery(songQuery);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ status: "loading" });
  const [mounted, setMounted] = useState(false);

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
    setState({ status: "loading" });

    void (async () => {
      try {
        const response = await fetch(searchEndpoint(accessKey), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, limit: 15 }),
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; results?: TikTokSearchResult[]; message?: string }
          | null;
        if (!response.ok || !body?.ok || !Array.isArray(body.results)) {
          throw new Error(body?.message || "Could not search TikTok. Try again.");
        }
        if (!controller.signal.aborted) setState({ status: "ready", results: body.results });
      } catch (problem) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: problem instanceof Error ? problem.message : "Could not search TikTok.",
        });
      }
    })();

    return () => controller.abort();
  }, [accessKey, attempt, localOnly, query]);

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
          </div>
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
              <p className="text-xs text-muted-foreground">Searching TikTok…</p>
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="flex flex-col items-start gap-3 px-3 py-6" role="alert">
              <p className="text-sm text-destructive">{state.message}</p>
              <div className="flex flex-wrap items-center gap-3">
                {localOnly ? null : (
                  <button
                    className="text-xs font-semibold text-brand"
                    onClick={() => setAttempt((current) => current + 1)}
                    type="button"
                  >
                    Try again
                  </button>
                )}
                <a
                  className="text-xs font-semibold text-brand"
                  href={tiktokPianoSearchUrl(songQuery)}
                  rel="noreferrer"
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

function TikTokResultRow({ item, rank }: { item: TikTokSearchResult; rank: number }) {
  return (
    <li className="flex items-center gap-2.5 border-t border-border px-3 py-2 first:border-t-0">
      <span className="w-4 shrink-0 text-center text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
        {rank}
      </span>
      <Cover src={item.coverUrl} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium">
          {item.desc || `Piano cover by @${item.uniqueId}`}
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
        rel="noreferrer"
        target="_blank"
      >
        Open
      </a>
    </li>
  );
}

function Cover({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span aria-hidden className="size-12 shrink-0 rounded-md bg-muted ring-1 ring-foreground/8" />;
  }
  return (
    // TikTok CDN often blocks hotlinking; hide the thumb if the request fails.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className="size-12 shrink-0 rounded-md bg-muted object-cover ring-1 ring-foreground/8"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={src}
    />
  );
}
