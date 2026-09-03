import { SiteFooter } from "@/components/site/footer";
import { SiteShell } from "@/components/site/shell";
import type { PlayerTrack } from "@/components/site/player";
import { getSiteContent, getSocialLinks } from "@/lib/site-content";
import { getSiteCatalog } from "@/lib/site/catalog";

import "../site.css";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [catalog, siteContent] = await Promise.all([getSiteCatalog(), getSiteContent()]);

  const tracks: PlayerTrack[] = catalog.tracks.map((track) => ({
    slug: track.slug,
    title: track.title,
    releaseTitle: track.releaseTitle,
    art: track.art,
    preview: track.preview,
    durationMs: track.durationMs,
    accent: track.accent,
    spotify: track.platforms.spotify,
  }));

  return (
    <SiteShell
      tracks={tracks}
      spotifyHref={siteContent.links.spotify}
      footer={
        <SiteFooter
          socials={getSocialLinks(siteContent)}
          contactEmail={siteContent.contactEmail}
        />
      }
    >
      {children}
    </SiteShell>
  );
}
