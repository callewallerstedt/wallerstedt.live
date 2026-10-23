"use client";

import { usePathname } from "next/navigation";
import { Fragment, type ReactNode } from "react";

import { Atmosphere, Reveal } from "@/components/site/atmosphere";
import { Nav } from "@/components/site/nav";
import { PlayerProvider, type PlayerTrack } from "@/components/site/player";
import { SignupModalProvider } from "@/components/site/signup-modal";

export function SiteShell({
  tracks,
  spotifyHref,
  art,
  footer,
  children,
}: {
  tracks: PlayerTrack[];
  spotifyHref: string;
  /** Cover art tinting the signup dialog. */
  art?: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="wl">
      <Atmosphere />
      <Reveal />
      {/* Keys are explicit because `children` and `footer` arrive from a server
          component, so React can't rely on the static-children fast path here. */}
      <PlayerProvider tracks={tracks}>
        <SignupModalProvider art={art}>
          <Nav key="nav" spotifyHref={spotifyHref} />
          <main className="wl-main" id="main" key="main">
            <div className="wl-page" key={pathname}>
              {children}
            </div>
          </main>
          <Fragment key="footer">{footer}</Fragment>
        </SignupModalProvider>
      </PlayerProvider>
    </div>
  );
}
