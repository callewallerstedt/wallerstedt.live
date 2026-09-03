import { FollowSection, PlaylistsSection } from "@/components/sections";
import { getSiteContent, getSocialLinks } from "@/lib/site-content";

export default async function PlaylistsPage() {
  const siteContent = await getSiteContent();

  return (
    <main>
      <PlaylistsSection playlists={siteContent.playlists} />
      <FollowSection links={getSocialLinks(siteContent)} />
    </main>
  );
}
