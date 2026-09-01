"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { artist } from "@/lib/artist";

export function SiteHeader() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navItems = [
    { href: "/#latest", label: "Latest", match: "/" },
    { href: "/music", label: "Music", match: "/music" },
    { href: "/playlists", label: "Playlists", match: "/playlists" },
    { href: "/random", label: "Random song", match: "" },
  ] as const;

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  return (
    <header className={isMenuOpen ? "site-header is-open" : "site-header"}>
      <div className="container site-header__inner">
        <Link className="brand-mark" href="/">{artist.shortName}</Link>
        <nav className="site-nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = item.match ? pathname === item.match || pathname.startsWith(`${item.match}/`) : false;
            const isSamePageLatestLink = item.match === "/" && pathname === "/";
            const href = isSamePageLatestLink ? "#latest" : item.href;

            if (isSamePageLatestLink) {
              return (
                <a key={item.href} href={href} aria-current={isActive ? "page" : undefined}>
                  {item.label}
                </a>
              );
            }

            return (
              <Link key={item.href} href={href} aria-current={isActive ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          className="site-menu-button"
          type="button"
          aria-expanded={isMenuOpen}
          aria-controls="site-mobile-nav"
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
      <div className="container site-menu-shell">
        <nav className="site-menu" id="site-mobile-nav" aria-label="Mobile primary">
          {navItems.map((item) => {
            const isActive = item.match ? pathname === item.match || pathname.startsWith(`${item.match}/`) : false;
            const isSamePageLatestLink = item.match === "/" && pathname === "/";
            const href = isSamePageLatestLink ? "#latest" : item.href;

            if (isSamePageLatestLink) {
              return (
                <a
                  key={item.href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </a>
              );
            }

            return (
              <Link
                key={item.href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
