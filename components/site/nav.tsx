"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { PlatformIcon } from "@/components/icons";
import { usePlayer } from "@/components/site/player";
import { SignupButton } from "@/components/site/signup-modal";

const items = [
  { href: "/music", label: "Music" },
  { href: "/playlists", label: "Playlists" },
] as const;

export function Nav({ spotifyHref }: { spotifyHref: string }) {
  const pathname = usePathname();
  const { isPlaying } = usePlayer();
  const [stuck, setStuck] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      setStuck(y > 24);
      setHidden(y > 400 && y > last + 2);
      if (y < last - 2) setHidden(false);
      last = y;
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`wl-nav${stuck ? " is-stuck" : ""}${hidden ? " is-hidden" : ""}`}>
      <div className="wl-shell wl-nav__inner">
        <Link className="wl-brand" href="/" aria-label="Wallerstedt home">
          <span className={`wl-brand__dot${isPlaying ? " is-live" : ""}`} />
          Wallerstedt
        </Link>

        <nav className="wl-nav__links" aria-label="Primary">
          {items.map((item) => (
            <Link
              key={item.href}
              className="wl-nav__link"
              href={item.href as Route}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <SignupButton source="nav" label="Updates" className="wl-mailbtn--nav" />
          <a className="wl-btn wl-btn--sm wl-btn--light" href={spotifyHref} target="_blank" rel="noreferrer">
            <PlatformIcon platform="spotify" />
            <span>Follow</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
