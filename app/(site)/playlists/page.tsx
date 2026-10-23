import type { Metadata } from "next";

import { PageHead, Playlists } from "@/components/site/sections";
import { getSiteContent } from "@/lib/site-content";
import { getPlaylists } from "@/lib/site/playlists";

export const metadata: Metadata = {
  title: "Playlists",
  description: "Piano playlists by Wallerstedt.",
};

export default async function PlaylistsPage() {
  const siteContent = await getSiteContent();
  const playlists = await getPlaylists(siteContent.playlists);

  return (
    <>
      <PageHead title="Playlists" />
      <Playlists playlists={playlists} />
    </>
  );
}
