import { redirect } from "next/navigation";

import { getCatalogSongs } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export default async function RandomPage() {
  const catalogSongs = await getCatalogSongs();
  const song = catalogSongs[Math.floor(Math.random() * catalogSongs.length)];
  redirect(`/${song.slug}`);
}
