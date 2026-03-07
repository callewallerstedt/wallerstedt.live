import { FeaturedPiecesSection, FollowSection, HomeHeroSection, LatestReleaseSection } from "@/components/sections";
import { songs } from "@/lib/site-data";
import { getSiteSettings } from "@/lib/site-settings";

export default async function HomePage() {
  const settings = await getSiteSettings();
  const featuredSongs = settings.featuredSongOrder.map((slug) => songs[slug]).filter(Boolean);
  const heroSong = songs[settings.heroFeaturedSlug] ?? featuredSongs[0];

  return (
    <main>
      <HomeHeroSection heroSong={heroSong} />
      <LatestReleaseSection />
      <FeaturedPiecesSection featuredSongs={featuredSongs} title="Featured music" />
      <FollowSection />
    </main>
  );
}
