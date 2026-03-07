import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";

import { artist, catalogSongs, type SongSlug } from "./site-data";

const settingsPath = path.join(process.cwd(), "data", "site-settings.json");
const adminCookieName = "wallerstedt_admin";

export interface SiteSettings {
  featuredSongOrder: SongSlug[];
  heroFeaturedSlug: SongSlug;
}

export const defaultSiteSettings: SiteSettings = {
  featuredSongOrder: ["emergence", "memories", "midnight", "september"],
  heroFeaturedSlug: "midnight",
};

const availableSongSlugs = new Set(catalogSongs.map((song) => song.slug));

function normalizeSettings(input: Partial<SiteSettings>): SiteSettings {
  const featuredSongOrder = Array.from(
    new Set((input.featuredSongOrder ?? []).filter((slug): slug is SongSlug => availableSongSlugs.has(slug))),
  ).slice(0, 4);

  const fallbackFeatured = featuredSongOrder.length > 0 ? featuredSongOrder : defaultSiteSettings.featuredSongOrder;
  const heroFeaturedSlug = availableSongSlugs.has(input.heroFeaturedSlug ?? "")
    ? (input.heroFeaturedSlug as SongSlug)
    : fallbackFeatured[0] ?? defaultSiteSettings.heroFeaturedSlug;

  return {
    featuredSongOrder: fallbackFeatured,
    heroFeaturedSlug,
  };
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? process.env.ADMIN_PAGE_PASSWORD ?? process.env.PASSWORD ?? "";
}

function getAdminToken(password: string) {
  return createHash("sha256").update(`${artist.shortName}:${password}`).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function isAdminConfigured() {
  return getAdminPassword().length > 0;
}

export async function isAdminAuthenticated() {
  const password = getAdminPassword();
  if (!password) {
    return false;
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(adminCookieName)?.value;
  if (!cookieValue) {
    return false;
  }

  return safeEqual(cookieValue, getAdminToken(password));
}

export function verifyAdminPassword(input: string) {
  const password = getAdminPassword();
  if (!password || !input) {
    return false;
  }

  return safeEqual(input, password);
}

export function getAdminSessionValue() {
  return getAdminToken(getAdminPassword());
}

export function getAdminCookieName() {
  return adminCookieName;
}

export async function getSiteSettings() {
  noStore();

  try {
    const raw = await readFile(settingsPath, "utf8");
    return normalizeSettings(JSON.parse(raw) as Partial<SiteSettings>);
  } catch {
    return defaultSiteSettings;
  }
}

export async function saveSiteSettings(input: Partial<SiteSettings>) {
  const nextSettings = normalizeSettings(input);
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
  return nextSettings;
}
