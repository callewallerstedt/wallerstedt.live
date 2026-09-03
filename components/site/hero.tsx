"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { PlatformIcon } from "@/components/icons";
import { PauseIcon, PlayIcon } from "@/components/site/icons";
import { usePlayer } from "@/components/site/player";

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

        const alpha = 0.07 + arch * 0.11 + nearness * 0.55 + musical * 0.4;
        const gradient = ctx.createLinearGradient(0, floor - h, 0, floor);
        gradient.addColorStop(0, `rgb(${rgb} / 0)`);
        gradient.addColorStop(1, `rgb(${rgb} / ${Math.min(0.85, alpha)})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = i % 12 === 0 ? 1.4 : 1;
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
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [isPlaying, level]);

  return <canvas className="wl-hero__strings" ref={ref} aria-hidden="true" />;
}

/** The spinning label ring with the cover art and a play control at its centre. */
function Disc({
  art,
  title,
  slug,
  queue,
}: {
  art: string;
  title: string;
  slug: string;
  queue: string[];
}) {
  const { toggle, isActive, isPlaying, playable } = usePlayer();
  const active = isActive(slug);
  const showPause = active && isPlaying;
  const label = `${title} — latest release — `;
  const ring = label.repeat(3).toUpperCase();

  return (
    <div className={`wl-disc${showPause ? " is-playing" : ""}`}>
      <svg className="wl-disc__ring" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <path id="wl-disc-path" d="M50,50 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0" fill="none" />
        </defs>
        <text>
          <textPath href="#wl-disc-path" startOffset="0" textLength="257" lengthAdjust="spacing">
            {ring}
          </textPath>
        </text>
      </svg>

      <div className="wl-disc__art">
        <Image src={art} alt={`${title} cover art`} width={520} height={520} priority sizes="380px" />
      </div>

      <button
        type="button"
        className="wl-disc__btn"
        onClick={() => toggle(slug, queue)}
        disabled={!playable(slug)}
        data-cursor={playable(slug) ? "play" : undefined}
        aria-label={`${showPause ? "Pause" : "Play"} ${title}`}
      >
        <span className="wl-disc__play">{showPause ? <PauseIcon /> : <PlayIcon />}</span>
      </button>
    </div>
  );
}

export function Hero({
  heading,
  lede,
  release,
  heroTrackSlug,
  queue,
  stats,
  spotifyHref,
  appleHref,
}: {
  heading: string[];
  lede: string;
  release: { title: string; art: string; date: string };
  heroTrackSlug: string;
  queue: string[];
  stats: Array<{ value: string; label: string }>;
  spotifyHref: string;
  appleHref: string;
}) {
  const { toggle, isActive, isPlaying } = usePlayer();
  const live = isActive(heroTrackSlug) && isPlaying;

  return (
    <section className="wl-hero">
      <Strings />

      <div className="wl-shell wl-hero__inner">
        <div className="wl-hero__copy">
          <p className="wl-eyebrow" data-wl-reveal="0">
            Piano · Gothenburg, Sweden
          </p>
          <h1 className="wl-display wl-hero__title" data-wl-reveal="1">
            {heading.map((line, index) => (
              <span key={line}>
                {line}
                {index === heading.length - 1 ? <i className="wl-hero__smile">:)</i> : null}
              </span>
            ))}
          </h1>
          <p className="wl-lede" data-wl-reveal="2">
            {lede}
          </p>
          <div className="wl-btn-row" data-wl-reveal="3">
            <button
              type="button"
              className="wl-btn wl-btn--solid"
              onClick={() => toggle(heroTrackSlug, queue)}
            >
              <span className="wl-btn__icon">{live ? <PauseIcon /> : <PlayIcon />}</span>
              <span>{live ? "Pause" : "Press play"}</span>
            </button>
            <Link className="wl-btn" href="/music">
              <span>All music</span>
            </Link>
            <a className="wl-btn wl-btn--ghost" href={spotifyHref} target="_blank" rel="noreferrer">
              <span className="wl-btn__icon">
                <PlatformIcon platform="spotify" />
              </span>
              <span>Spotify</span>
            </a>
            <a className="wl-btn wl-btn--ghost" href={appleHref} target="_blank" rel="noreferrer">
              <span className="wl-btn__icon">
                <PlatformIcon platform="appleMusic" />
              </span>
              <span>Apple Music</span>
            </a>
          </div>
        </div>

        <div data-wl-reveal="4">
          <Disc art={release.art} title={release.title} slug={heroTrackSlug} queue={queue} />
        </div>
      </div>

      <div className="wl-shell wl-hero__foot" data-wl-reveal="5">
        <div className="wl-hero__stats">
          {stats.map((stat) => (
            <div className="wl-stat" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
        <a className="wl-scroll-cue" href="#latest">
          <i />
          Scroll
        </a>
      </div>
    </section>
  );
}
