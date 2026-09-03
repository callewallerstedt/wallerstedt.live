"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import { accentVars } from "@/components/site/accent";
import { PlayButton } from "@/components/site/player";
import type { SiteRelease } from "@/lib/site/types";

/**
 * The whole catalogue as a typographic index. Hovering a row floats its cover
 * next to the pointer, which keeps the list dense without losing the artwork.
 */
export function ReleaseIndex({ releases }: { releases: SiteRelease[] }) {
  const peekRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const node = peekRef.current;
    if (!node) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    let started = false;

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!started) {
        x = targetX;
        y = targetY;
        started = true;
      }
    };

    const tick = () => {
      x += (targetX - x) * 0.14;
      y += (targetY - y) * 0.14;
      const drift = Math.max(-8, Math.min(8, (targetX - x) * 0.35));
      node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${hovered ? 1 : 0.86}) rotate(${drift * 0.4}deg)`;
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [hovered]);

  return (
    <>
      <div className={`wl-index__peek${hovered ? " is-on" : ""}`} ref={peekRef} aria-hidden="true">
        {releases.map((release) => (
          <Image
            key={release.slug}
            className={release.slug === hovered ? "is-on" : ""}
            src={release.art}
            alt=""
            width={420}
            height={420}
            sizes="210px"
          />
        ))}
      </div>

      <div className="wl-index" onPointerLeave={() => setHovered(null)}>
        {releases.map((release) => (
          <article
            className="wl-index__row"
            key={release.slug}
            style={accentVars(release.accent)}
            onPointerEnter={() => setHovered(release.slug)}
          >
            <Link
              className="wl-index__link"
              href={release.href as Route}
              aria-label={`Open ${release.title}`}
            />
            <span className="wl-index__year">{release.year}</span>

            <div className="wl-index__title">
              <h3>{release.title}</h3>
              <span className={`wl-tag${release.upcoming ? " wl-tag--accent" : ""}`}>
                {release.upcoming ? "Upcoming" : release.format}
              </span>
            </div>

            <div className="wl-index__end">
              <span className="wl-index__count">
                {release.tracks.length} {release.tracks.length === 1 ? "track" : "tracks"}
              </span>
              <PlayButton
                slug={release.tracks[0].slug}
                queue={release.tracks.map((track) => track.slug)}
                label={release.title}
              />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
