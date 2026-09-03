"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { usePlayer } from "@/components/site/player";

const items = [
  { href: "/music", label: "Music", index: "01" },
  { href: "/playlists", label: "Playlists", index: "02" },
  { href: "/updates", label: "Updates", index: "03" },
  { href: "/random", label: "Surprise me", index: "04" },
] as const;

export function Nav({ spotifyHref }: { spotifyHref: string }) {
  const pathname = usePathname();
  const { isPlaying } = usePlayer();
  const [stuck, setStuck] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let last = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      setStuck(y > 24);
      setHidden(y > 320 && y > last && !open);
      last = y;
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.querySelector(".wl")?.classList.toggle("is-locked", open);
  }, [open]);

  return (
    <>
      <header
        className={`wl-nav${stuck ? " is-stuck" : ""}${hidden ? " is-hidden" : ""}`}
        data-wl-nav=""
      >
        <div className="wl-shell wl-nav__inner">
          <Link className="wl-brand" href="/" aria-label="Wallerstedt — home">
            <span className={`wl-brand__dot${isPlaying ? " is-live" : ""}`} />
            Wallerstedt
          </Link>

          <nav className="wl-nav__links" aria-label="Primary">
            {items.map((item) => (
              <Link
                key={item.href}
                className="wl-nav__link"
                href={item.href as Route}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
            <a className="wl-btn wl-btn--sm" href={spotifyHref} target="_blank" rel="noreferrer">
              <span>Listen</span>
            </a>
          </nav>

          <button
            type="button"
            className={`wl-nav__toggle${open ? " is-open" : ""}`}
            aria-expanded={open}
            aria-controls="wl-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            <span />
          </button>
        </div>
      </header>

      <div className={`wl-menu${open ? " is-open" : ""}`} id="wl-menu">
        <nav className="wl-menu__list" aria-label="Mobile">
          <Link className="wl-menu__link" href="/" style={{ ["--i" as string]: 0 }}>
            <span>00</span>
            Home
          </Link>
          {items.map((item, index) => (
            <Link
              key={item.href}
              className="wl-menu__link"
              href={item.href as Route}
              style={{ ["--i" as string]: index + 1 }}
            >
              <span>{item.index}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="wl-menu__foot">
          <p className="wl-meta">Gothenburg, Sweden</p>
          <a className="wl-btn wl-btn--sm" href={spotifyHref} target="_blank" rel="noreferrer">
            <span>Open Spotify</span>
          </a>
        </div>
      </div>
    </>
  );
}
