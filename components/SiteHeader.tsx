import Link from "next/link";

import { artist } from "@/lib/site-data";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="brand-mark" href="/">
          <span className="brand-mark__dot"></span>
          <span>{artist.shortName}</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/#latest">Latest</Link>
          <Link href="/#pieces">Pieces</Link>
          <Link href="/#about">About</Link>
          <Link href="/#playlists">Playlists</Link>
          <Link href="/#follow">Follow</Link>
          <Link href="/random">Random song</Link>
        </nav>
      </div>
    </header>
  );
}
