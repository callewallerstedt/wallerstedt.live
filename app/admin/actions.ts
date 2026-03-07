"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

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
