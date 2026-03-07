import { FeaturedPiecesSection, FollowSection, MusicCatalogSection } from "@/components/sections";
import { songs } from "@/lib/site-data";
import { getSiteSettings } from "@/lib/site-settings";

export default async function MusicPage() {
  const settings = await getSiteSettings();
  const featuredSongs = settings.featuredSongOrder.map((slug) => songs[slug]).filter(Boolean);

  return (
    <main>
      <FeaturedPiecesSection featuredSongs={featuredSongs} eyebrow="Music" title="Featured pieces" compact />
      <MusicCatalogSection />
      <FollowSection />
    </main>
  );
}
