import { FeaturedPiecesSection, FollowSection, HomeHeroSection, LatestReleaseSection } from "@/components/sections";
import { getSiteContent, getSocialLinks } from "@/lib/site-content";
import { getCatalogSongs, getLatestRelease } from "@/lib/site-data";
import { getSiteSettings } from "@/lib/site-settings";

export default async function HomePage() {
  const [settings, siteContent, catalogSongs, latestRelease] = await Promise.all([
    getSiteSettings(),
    getSiteContent(),
    getCatalogSongs(),
    getLatestRelease(),
  ]);
  const songs = Object.fromEntries(catalogSongs.map((song) => [song.slug, song]));
  const featuredSongs = settings.featuredSongOrder.map((slug) => songs[slug]).filter(Boolean);
  const heroSong = songs[settings.heroFeaturedSlug] ?? featuredSongs[0] ?? catalogSongs[0];

  if (!heroSong) {
    return <main className="home-page"></main>;
  }

  return (
    <main className="home-page">
      <HomeHeroSection heroSong={heroSong} latestRelease={latestRelease} siteContent={siteContent} />
      <LatestReleaseSection latestRelease={latestRelease} />
      <FeaturedPiecesSection featuredSongs={featuredSongs} title="Featured music" />
      <FollowSection links={getSocialLinks(siteContent)} />
    </main>
  );
}
