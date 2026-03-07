import Link from "next/link";

import { artist } from "@/lib/site-data";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="brand-mark" href="/">
          <span>{artist.shortName}</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/#latest">Latest</Link>
          <Link href="/music">Music</Link>
          <Link href="/playlists">Playlists</Link>
          <Link href="/updates">Updates</Link>
          <Link href="/random">Random song</Link>
        </nav>
      </div>
    </header>
  );
}
