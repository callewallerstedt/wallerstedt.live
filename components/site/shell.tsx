"use client";

import { usePathname } from "next/navigation";
import { Fragment, type ReactNode } from "react";

import { Atmosphere, Cursor, Reveal } from "@/components/site/atmosphere";
import { Nav } from "@/components/site/nav";
import { PlayerProvider, type PlayerTrack } from "@/components/site/player";

export function SiteShell({
  tracks,
  spotifyHref,
  footer,
  children,
}: {
  tracks: PlayerTrack[];
  spotifyHref: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="wl">
      <Atmosphere />
      <Cursor />
      <Reveal />
      {/* Keys are explicit because `children` and `footer` arrive from a server
          component, so React can't rely on the static-children fast path here. */}
      <PlayerProvider tracks={tracks}>
        <Nav key="nav" spotifyHref={spotifyHref} />
        <main className="wl-main" id="main" key="main">
          <div className="wl-page" key={pathname}>
            {children}
          </div>
        </main>
        <Fragment key="footer">{footer}</Fragment>
      </PlayerProvider>
    </div>
  );
}
