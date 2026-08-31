"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { saveSiteContent, type SiteContent } from "@/lib/site-content";
import { addSong } from "@/lib/site-data";
import {
  getAdminCookieName,
  getAdminSessionValue,
  saveSiteSettings,
  verifyAdminPassword,
} from "@/lib/site-settings";

function normalizeFeaturedSongs(formData: FormData) {
  const featuredSongOrder = [
    formData.get("featuredSong1"),
    formData.get("featuredSong2"),
    formData.get("featuredSong3"),
    formData.get("featuredSong4"),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return featuredSongOrder;
}

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!verifyAdminPassword(password)) {
    return { ok: false, message: "Wrong password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(getAdminCookieName(), getAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return { ok: true, message: "Signed in." };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(getAdminCookieName());
}

export async function saveSettingsAction(formData: FormData) {
  await saveSiteSettings({
    featuredSongOrder: normalizeFeaturedSongs(formData),
    heroFeaturedSlug: String(formData.get("heroFeaturedSlug") ?? ""),
  });

  revalidatePath("/");
  revalidatePath("/music");
  revalidatePath("/admin");

  return { ok: true, message: "Homepage settings saved." };
}

function normalizePlaylists(formData: FormData): SiteContent["playlists"] {
  return [1, 2, 3].map((index) => ({
    title: String(formData.get(`playlist${index}Title`) ?? ""),
    description: String(formData.get(`playlist${index}Description`) ?? ""),
    href: String(formData.get(`playlist${index}Href`) ?? ""),
    label: String(formData.get(`playlist${index}Label`) ?? ""),
  }));
}

export async function saveSiteContentAction(formData: FormData) {
  await saveSiteContent({
    heroHeading: String(formData.get("heroHeading") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    tagline: String(formData.get("tagline") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    links: {
      spotify: String(formData.get("linkSpotify") ?? ""),
      appleMusic: String(formData.get("linkAppleMusic") ?? ""),
      patreon: String(formData.get("linkPatreon") ?? ""),
      instagram: String(formData.get("linkInstagram") ?? ""),
      youtube: String(formData.get("linkYouTube") ?? ""),
      tiktok: String(formData.get("linkTikTok") ?? ""),
    },
    playlists: normalizePlaylists(formData),
  });

  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/music");
  revalidatePath("/playlists");
  revalidatePath("/updates");
  revalidatePath("/admin");

  return { ok: true, message: "Site content saved." };
}

export async function addSongAction(formData: FormData) {
  const result = await addSong(formData);

  if (!result.ok) {
    return result;
  }

  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/music");
  revalidatePath("/random");
  revalidatePath("/admin");
  revalidatePath(`/${result.song.slug}`);

  return result;
}
