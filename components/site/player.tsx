"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "@/components/site/icons";

export interface PlayerTrack {
  slug: string;
  title: string;
  releaseTitle: string;
  art: string;
  preview: string | null;
  durationMs: number | null;
  accent: string;
  spotify?: string;
}

interface PlayerApi {
  current: PlayerTrack | null;
  isPlaying: boolean;
  progress: number;
  elapsed: number;
  duration: number;
  toggle: (slug: string, queue?: string[]) => void;
  isActive: (slug: string) => boolean;
  playable: (slug: string) => boolean;
  next: () => void;
  previous: () => void;
  seek: (ratio: number) => void;
  /** 0–1 loudness of the moment, for canvases that want to breathe with the music. */
  level: () => number;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer() {
  const api = useContext(PlayerContext);
  if (!api) {
    throw new Error("usePlayer must be used inside <PlayerProvider>");
  }
  return api;
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function applyAccent(accent: string) {
  const [r, g, b] = accent.split(" ");
  if (!r || !g || !b) return;
  const root = document.documentElement.style;
  root.setProperty("--wl-accent-r", r);
  root.setProperty("--wl-accent-g", g);
  root.setProperty("--wl-accent-b", b);
}

export function PlayerProvider({
  tracks,
  children,
}: {
  tracks: PlayerTrack[];
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const levelRef = useRef(0);
  const frameRef = useRef(0);
  const resolvedRef = useRef<Record<string, string>>({});

  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const bySlug = useMemo(() => new Map(tracks.map((track) => [track.slug, track])), [tracks]);
  const current = currentSlug ? bySlug.get(currentSlug) ?? null : null;

  // --- Web Audio graph, created lazily on the first gesture ------------------
  const ensureGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || ctxRef.current) {
      return;
    }

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      const ctx = new Ctor();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      ctxRef.current = ctx;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // Analysis is a nicety — playback still works without it.
      ctxRef.current = null;
      analyserRef.current = null;
    }
  }, []);

  const startAudio = useCallback(
    async (src: string) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.src !== src) {
        audio.src = src;
      }
      ensureGraph();
      if (ctxRef.current?.state === "suspended") {
        await ctxRef.current.resume().catch(() => {});
      }
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    },
    [ensureGraph],
  );

  const playSlug = useCallback(
    async (slug: string) => {
      const track = bySlug.get(slug);
      if (!track) return;
      const src = resolvedRef.current[slug] ?? track.preview;
      if (!src) return;
      setCurrentSlug(slug);
      applyAccent(track.accent);
      await startAudio(src);
    },
    [bySlug, startAudio],
  );

  const toggle = useCallback(
    (slug: string, nextQueue?: string[]) => {
      const audio = audioRef.current;
      if (nextQueue?.length) {
        setQueue(nextQueue);
      } else if (!queue.length) {
        setQueue(tracks.filter((track) => track.preview).map((track) => track.slug));
      }

      if (slug === currentSlug && audio) {
        if (audio.paused) {
          void startAudio(audio.src);
        } else {
          audio.pause();
        }
        return;
      }

      void playSlug(slug);
    },
    [currentSlug, playSlug, queue.length, startAudio, tracks],
  );

  const step = useCallback(
    (delta: number) => {
      if (!currentSlug) return;
      const list = queue.length ? queue : tracks.map((track) => track.slug);
      const index = list.indexOf(currentSlug);
      if (index === -1) return;
      for (let hop = 1; hop <= list.length; hop += 1) {
        const candidate = list[(index + delta * hop + list.length * hop) % list.length];
        const track = bySlug.get(candidate);
        if (track?.preview || resolvedRef.current[candidate]) {
          void playSlug(candidate);
          return;
        }
      }
    },
    [bySlug, currentSlug, playSlug, queue, tracks],
  );

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
  }, []);

  // --- audio element wiring -------------------------------------------------
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => step(1);

    /**
     * Preview URLs are handed out by Spotify and rotate from time to time. If the
     * cached one has gone stale, ask the server for a fresh one and retry once.
     */
    const onError = async () => {
      const slug = currentSlug;
      if (!slug || resolvedRef.current[`${slug}:tried`]) return;
      resolvedRef.current[`${slug}:tried`] = "1";
      try {
        const res = await fetch(`/api/preview/${encodeURIComponent(slug)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { url?: string };
        if (!data.url) return;
        resolvedRef.current[slug] = data.url;
        await startAudio(data.url);
      } catch {
        // Give up quietly; the platform links are still right there.
      }
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("playing", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("playing", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [currentSlug, startAudio, step]);

  // --- animation frame: progress + level ------------------------------------
  useEffect(() => {
    if (!isPlaying) {
      levelRef.current = 0;
      return;
    }

    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        setElapsed(audio.currentTime);
        if (audio.duration && audio.duration !== duration) {
          setDuration(audio.duration);
        }
      }

      const analyser = analyserRef.current;
      const data = dataRef.current;
      if (analyser && data) {
        analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < data.length; i += 8) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / (data.length / 8));
        levelRef.current = levelRef.current * 0.72 + Math.min(1, rms * 2.6) * 0.28;
      } else {
        const t = performance.now() / 1000;
        levelRef.current = 0.28 + Math.sin(t * 1.7) * 0.1 + Math.sin(t * 0.6) * 0.06;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [duration, isPlaying]);

  // --- lock screen / hardware keys -----------------------------------------
  useEffect(() => {
    if (!current || typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: "Wallerstedt",
      album: current.releaseTitle,
      artwork: [{ src: current.art, sizes: "512x512", type: "image/jpeg" }],
    });
    navigator.mediaSession.setActionHandler("play", () => toggle(current.slug));
    navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
  }, [current, step, toggle]);

  // --- spacebar toggles -----------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !currentSlug) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      event.preventDefault();
      toggle(currentSlug);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentSlug, toggle]);

  // --- keep the layout clear of the docked player ---------------------------
  useEffect(() => {
    document.documentElement.style.setProperty("--wl-player-h", current ? "92px" : "0px");
  }, [current]);

  const api = useMemo<PlayerApi>(
    () => ({
      current,
      isPlaying,
      progress: duration ? elapsed / duration : 0,
      elapsed,
      duration,
      toggle,
      isActive: (slug) => slug === currentSlug,
      playable: (slug) => Boolean(bySlug.get(slug)?.preview),
      next: () => step(1),
      previous: () => step(-1),
      seek,
      level: () => levelRef.current,
    }),
    [bySlug, current, currentSlug, duration, elapsed, isPlaying, seek, step, toggle],
  );

  return (
    <PlayerContext.Provider value={api}>
      {children}
      <audio ref={audioRef} crossOrigin="anonymous" preload="none" playsInline />
      <PlayerBar />
    </PlayerContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */

export function PlayButton({
  slug,
  queue,
  label,
  large = false,
  className = "",
}: {
  slug: string;
  queue?: string[];
  label?: string;
  large?: boolean;
  className?: string;
}) {
  const { toggle, isActive, isPlaying, playable } = usePlayer();
  const active = isActive(slug);
  const enabled = playable(slug);
  const showPause = active && isPlaying;

  return (
    <button
      type="button"
      className={`wl-play${large ? " wl-play--lg" : ""}${active ? " is-active" : ""} ${className}`.trim()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(slug, queue);
      }}
      disabled={!enabled}
      data-cursor={enabled ? "play" : undefined}
      aria-label={
        enabled
          ? `${showPause ? "Pause" : "Play"} ${label ?? "preview"}`
          : `Preview unavailable for ${label ?? "this track"}`
      }
      title={enabled ? undefined : "Preview unavailable — open it on Spotify or Apple Music"}
    >
      {showPause ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

export function NowPlayingBars({ slug }: { slug: string }) {
  const { isActive, isPlaying } = usePlayer();
  if (!isActive(slug)) {
    return null;
  }
  return (
    <span className={`wl-eq${isPlaying ? "" : " is-paused"}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function Waveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { level, isPlaying } = usePlayer();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    let phase = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const accent = () => {
      const styles = getComputedStyle(document.documentElement);
      const r = styles.getPropertyValue("--wl-accent-r").trim() || "212";
      const g = styles.getPropertyValue("--wl-accent-g").trim() || "165";
      const b = styles.getPropertyValue("--wl-accent-b").trim() || "108";
      return `${Math.round(Number(r))} ${Math.round(Number(g))} ${Math.round(Number(b))}`;
    };

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const rgb = accent();
      const amp = isPlaying ? level() : 0.06;
      phase += reduce ? 0 : isPlaying ? 0.035 : 0.008;

      const mid = h / 2;
      const step = 5;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";

      for (let x = 0; x <= w; x += step) {
        const norm = x / w;
        const envelope = Math.sin(norm * Math.PI) ** 0.7;
        const wave =
          Math.sin(norm * 22 + phase * 2.1) * 0.6 + Math.sin(norm * 9 - phase * 1.4) * 0.4;
        const height = Math.max(1.5, Math.abs(wave) * envelope * amp * h * 0.92);
        const alpha = 0.18 + envelope * amp * 0.8;
        ctx.strokeStyle = `rgb(${rgb} / ${Math.min(0.9, alpha)})`;
        ctx.beginPath();
        ctx.moveTo(x, mid - height / 2);
        ctx.lineTo(x, mid + height / 2);
        ctx.stroke();
      }

      frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [isPlaying, level]);

  return <canvas ref={canvasRef} className="wl-player__viz" aria-hidden="true" />;
}

function PlayerBar() {
  const { current, isPlaying, toggle, next, previous, seek, progress, elapsed, duration } = usePlayer();
  const barRef = useRef<HTMLDivElement>(null);

  const onScrub = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    seek((event.clientX - rect.left) / rect.width);
  };

  return (
    <div className={`wl-player${current ? " is-on" : ""}`} aria-hidden={current ? undefined : true}>
      <Waveform />
      <div
        className="wl-player__bar"
        ref={barRef}
        onClick={onScrub}
        role="presentation"
        style={{ ["--p" as string]: `${Math.min(100, progress * 100)}%` }}
      >
        <i />
      </div>
      <div className="wl-shell wl-player__inner">
        <div className="wl-player__art">
          {current ? (
            <Image src={current.art} alt="" width={92} height={92} sizes="46px" />
          ) : null}
        </div>
        <div className="wl-player__meta">
          <strong>
            {current ? (
              <Link href={`/${current.slug}` as Route}>{current.title}</Link>
            ) : (
              "—"
            )}
          </strong>
          <span>
            {current ? `${current.releaseTitle} · 30-second preview` : ""}
          </span>
        </div>
        <div className="wl-player__controls">
          <span className="wl-player__time">
            {formatClock(elapsed)} / {formatClock(duration || 30)}
          </span>
          <button type="button" className="wl-player__btn" onClick={previous} aria-label="Previous track">
            <PrevIcon />
          </button>
          <button
            type="button"
            className="wl-play is-active"
            onClick={() => current && toggle(current.slug)}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="wl-player__btn" onClick={next} aria-label="Next track">
            <NextIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
