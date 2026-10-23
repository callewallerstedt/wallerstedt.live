"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import { PlatformIcon, platformLabel } from "@/components/icons";
import { PauseIcon, PlayIcon } from "@/components/site/icons";
import { usePlayer } from "@/components/site/player";
import { SignupButton } from "@/components/site/signup-modal";
import type { PlatformKey } from "@/lib/site-data";

/**
 * Eighty-eight hairlines along the floor of the hero — a piano keyboard seen
 * edge-on. They breathe on their own, lean toward the pointer, and swell with
 * whatever is playing.
 */
function Strings() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { level, isPlaying } = usePlayer();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const KEYS = 88;
    let frame = 0;
    let time = 0;
    let pointerX = -1;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
    };

    const onLeave = () => {
      pointerX = -1;
    };

    const accent = () => {
      const styles = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: number) => {
        const value = Number(styles.getPropertyValue(name).trim());
        return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
      };
      return `${read("--wl-accent-r", 212)} ${read("--wl-accent-g", 165)} ${read("--wl-accent-b", 108)}`;
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const rgb = accent();
      const loudness = isPlaying ? level() : 0;
      time += reduce ? 0 : 0.006 + loudness * 0.012;

      const margin = width * 0.02;
      const span = width - margin * 2;
      const gap = span / (KEYS - 1);
      const floor = height;
      const baseHeight = height * 0.3;

      for (let i = 0; i < KEYS; i += 1) {
        const x = margin + i * gap;
        const n = i / (KEYS - 1);

        // Layered slow waves so no two lines move in step.
        const sway =
          Math.sin(time * 1.4 + i * 0.28) * 0.5 +
          Math.sin(time * 0.63 + i * 0.11) * 0.34 +
          Math.sin(time * 2.1 + i * 0.55) * 0.16;

        const nearness =
          pointerX < 0 ? 0 : Math.max(0, 1 - Math.abs(x - pointerX) / (width * 0.16)) ** 2;

        const musical = loudness * (0.55 + Math.sin(i * 0.9 + time * 5.2) * 0.45);
        const arch = Math.sin(n * Math.PI) ** 0.55;

        const h =
          baseHeight * arch * (0.42 + sway * 0.22) +
          nearness * height * 0.2 +
          musical * height * 0.24 * arch;

        const alpha = 0.05 + arch * 0.08 + nearness * 0.45 + musical * 0.4;
        const gradient = ctx.createLinearGradient(0, floor - h, 0, floor);
        gradient.addColorStop(0, `rgb(${rgb} / 0)`);
        gradient.addColorStop(1, `rgb(${rgb} / ${Math.min(0.8, alpha)})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, floor);
        ctx.lineTo(x, floor - h);
        ctx.stroke();
      }

      frame = requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [isPlaying, level]);

  return <canvas className="wl-hero__strings" ref={ref} aria-hidden="true" />;
}

/** Cover art in a sleeve that tilts toward the pointer, with a record that slides out and spins while it plays. */
function Sleeve({ art, title, slug, queue }: { art: string; title: string; slug: string; queue: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { toggle, isActive, isPlaying, playable } = usePlayer();
  const live = isActive(slug) && isPlaying;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;

    const onMove = (event: PointerEvent) => {
      tx = (event.clientX / window.innerWidth - 0.5) * 2;
      ty = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    const tick = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      node.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
      node.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={`wl-sleeve${live ? " is-playing" : ""}`} ref={ref}>
      <div className="wl-sleeve__tilt">
        <div className="wl-sleeve__record" aria-hidden="true">
          <Image src={art} alt="" width={240} height={240} sizes="120px" />
        </div>
        <button
          type="button"
          className="wl-sleeve__cover"
          onClick={() => toggle(slug, queue)}
          disabled={!playable(slug)}
          aria-label={`${live ? "Pause" : "Play"} ${title}`}
        >
          <Image src={art} alt={`${title} cover art`} width={720} height={720} priority sizes="(max-width: 900px) 70vw, 440px" />
          <span className="wl-sleeve__play">{live ? <PauseIcon /> : <PlayIcon />}</span>
        </button>
      </div>
    </div>
  );
}

const platformOrder: PlatformKey[] = ["spotify", "appleMusic", "youtube", "amazonMusic", "deezer", "tidal", "soundcloud"];

/** A round plus that folds out every store the release is on. */
function ListenMenu({ platforms, more, title }: { platforms: Partial<Record<PlatformKey, string>>; more: string; title: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const available = platformOrder.filter((key) => platforms[key]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`wl-listen${open ? " is-open" : ""}`} ref={ref}>
      <button
        type="button"
        className="wl-plus"
        aria-expanded={open}
        aria-controls="wl-listen-list"
        aria-label={open ? "Hide platforms" : `Listen to ${title} on other platforms`}
        title="More platforms"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <div className="wl-listen__list" id="wl-listen-list" role="list">
        {available.map((key, index) => (
          <a
            key={key}
            role="listitem"
            className="wl-platform"
            href={platforms[key]}
            target="_blank"
            rel="noreferrer"
            tabIndex={open ? 0 : -1}
            style={{ ["--i" as string]: index }}
          >
            <PlatformIcon platform={key} />
            <span>{platformLabel[key]}</span>
          </a>
        ))}
        {more ? (
          <a
            role="listitem"
            className="wl-platform"
            href={more}
            target="_blank"
            rel="noreferrer"
            tabIndex={open ? 0 : -1}
            style={{ ["--i" as string]: available.length }}
          >
            <span>All platforms</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function Hero({
  release,
  heroTrackSlug,
  queue,
  listeners,
  spotifyHref,
}: {
  release: {
    title: string;
    art: string;
    href: string;
    upcoming: boolean;
    platforms: Partial<Record<PlatformKey, string>>;
    allPlatforms: string;
  };
  heroTrackSlug: string;
  queue: string[];
  listeners: string;
  spotifyHref: string;
}) {
  const { toggle, isActive, isPlaying } = usePlayer();
  const live = isActive(heroTrackSlug) && isPlaying;
  const name = "Wallerstedt";

  return (
    <section className="wl-hero">
      <div className="wl-hero__backdrop" aria-hidden="true">
        <Image src={release.art} alt="" width={480} height={480} priority sizes="100vw" />
      </div>
      <Strings />

      <div className="wl-shell wl-hero__inner">
        <div className="wl-hero__copy">
          <Link className="wl-pill wl-intro" href={release.href as Route} style={{ ["--i" as string]: 0 }}>
            <span className="wl-pill__dot" />
            {release.upcoming ? "Coming soon" : "New"}: {release.title}
          </Link>

          <h1 className="wl-hero__title" aria-label={name}>
            {name.split("").map((letter, index) => (
              <span key={index} aria-hidden="true" style={{ ["--i" as string]: index }}>
                {letter}
              </span>
            ))}
          </h1>

          <p className="wl-hero__lede wl-intro" style={{ ["--i" as string]: 6 }}>
            Piano music from Sweden.
            <span>{listeners} monthly listeners</span>
          </p>

          <div className="wl-btn-row wl-intro" style={{ ["--i" as string]: 8 }}>
            <button type="button" className="wl-btn wl-btn--light" onClick={() => toggle(heroTrackSlug, queue)}>
              {live ? <PauseIcon /> : <PlayIcon />}
              <span>{live ? "Pause" : "Play"}</span>
            </button>
            <a className="wl-btn wl-btn--spotify" href={spotifyHref} target="_blank" rel="noreferrer">
              <PlatformIcon platform="spotify" />
              <span>Follow on Spotify</span>
            </a>
            <ListenMenu platforms={release.platforms} more={release.allPlatforms} title={release.title} />
          </div>

          <div className="wl-intro" style={{ ["--i" as string]: 10 }}>
            <SignupButton source="hero" label="Email updates" className="wl-mailbtn--quiet" />
          </div>
        </div>

        <div className="wl-hero__art wl-intro" style={{ ["--i" as string]: 3 }}>
          <Sleeve art={release.art} title={release.title} slug={heroTrackSlug} queue={queue} />
        </div>
      </div>
    </section>
  );
}
