import { redirect } from "next/navigation";

import { catalogSongs } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export default function RandomPage() {
  const song = catalogSongs[Math.floor(Math.random() * catalogSongs.length)];
  redirect(`/${song.slug}`);
}
