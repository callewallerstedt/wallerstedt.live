import type { Metadata } from "next";

import { Playlists } from "@/components/site/sections";
import { getSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Playlists",
  description: "Piano playlists put together by Wallerstedt for focus, evenings, and quiet rooms.",
};

export default async function PlaylistsPage() {
  const siteContent = await getSiteContent();

  return (
    <>
      <section className="wl-head">
        <div className="wl-shell wl-head__inner">
          <p className="wl-eyebrow" data-wl-reveal="0">
            Playlists
          </p>
          <div className="wl-head__row">
            <h1 className="wl-display wl-head__title" data-wl-reveal="1">
              Long listens
            </h1>
            <p className="wl-lede" data-wl-reveal="2">
              Hours rather than minutes. Put one on, leave it, and get on with the evening.
            </p>
          </div>
        </div>
      </section>

      <Playlists playlists={siteContent.playlists} />
    </>
  );
}
