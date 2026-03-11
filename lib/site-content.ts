import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { unstable_noStore as noStore } from "next/cache";

import { artist, playlists as defaultPlaylists, socialLinks as defaultSocialLinks, type PlaylistCard, type SocialLink } from "./site-data";

const siteContentPath = path.join(process.cwd(), "data", "site-content.json");

type ManagedSocialKey = "spotify" | "appleMusic" | "instagram" | "youtube" | "tiktok" | "patreon";

export interface SiteContent {
  heroHeading: string;
  bio: string;
  tagline: string;
  contactEmail: string;
  links: Record<ManagedSocialKey, string>;
  playlists: PlaylistCard[];
}

export const defaultSiteContent: SiteContent = {
  heroHeading: "I make piano music :)",
  bio: artist.bio,
  tagline: artist.tagline,
  contactEmail: artist.contact,
  links: {
    spotify: defaultSocialLinks.find((link) => link.key === "spotify")?.href ?? artist.spotify,
    appleMusic: defaultSocialLinks.find((link) => link.key === "appleMusic")?.href ?? "",
    instagram: defaultSocialLinks.find((link) => link.key === "instagram")?.href ?? "",
    youtube: defaultSocialLinks.find((link) => link.key === "youtube")?.href ?? "",
    tiktok: defaultSocialLinks.find((link) => link.key === "tiktok")?.href ?? "",
    patreon: defaultSocialLinks.find((link) => link.key === "patreon")?.href ?? "",
  },
  playlists: defaultPlaylists,
};

function normalizeString(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizePlaylist(input: Partial<PlaylistCard> | undefined, fallback: PlaylistCard): PlaylistCard {
  return {
    title: normalizeString(input?.title, fallback.title),
    description: normalizeString(input?.description, fallback.description),
    href: normalizeString(input?.href, fallback.href),
    label: normalizeString(input?.label, fallback.label),
  };
}

function normalizeSiteContent(input: Partial<SiteContent>): SiteContent {
  const playlists = defaultSiteContent.playlists.map((playlist, index) =>
    normalizePlaylist(input.playlists?.[index], playlist),
  );

  return {
    heroHeading: normalizeString(input.heroHeading, defaultSiteContent.heroHeading),
    bio: normalizeString(input.bio, defaultSiteContent.bio),
    tagline: normalizeString(input.tagline, defaultSiteContent.tagline),
    contactEmail: normalizeString(input.contactEmail, defaultSiteContent.contactEmail),
    links: {
      spotify: normalizeString(input.links?.spotify, defaultSiteContent.links.spotify),
      appleMusic: normalizeString(input.links?.appleMusic, defaultSiteContent.links.appleMusic),
      instagram: normalizeString(input.links?.instagram, defaultSiteContent.links.instagram),
      youtube: normalizeString(input.links?.youtube, defaultSiteContent.links.youtube),
      tiktok: normalizeString(input.links?.tiktok, defaultSiteContent.links.tiktok),
      patreon: normalizeString(input.links?.patreon, defaultSiteContent.links.patreon),
    },
    playlists,
  };
}

export async function getSiteContent() {
  noStore();

  try {
    const raw = await readFile(siteContentPath, "utf8");
    return normalizeSiteContent(JSON.parse(raw) as Partial<SiteContent>);
  } catch {
    return defaultSiteContent;
  }
}

export async function saveSiteContent(input: Partial<SiteContent>) {
  const nextContent = normalizeSiteContent(input);
  await mkdir(path.dirname(siteContentPath), { recursive: true });
  await writeFile(siteContentPath, `${JSON.stringify(nextContent, null, 2)}\n`, "utf8");
  return nextContent;
}

export function getSocialLinks(content: SiteContent): SocialLink[] {
  return [
    { key: "spotify", label: "Spotify", href: content.links.spotify },
    { key: "appleMusic", label: "Apple Music", href: content.links.appleMusic },
    { key: "instagram", label: "Instagram", href: content.links.instagram },
    { key: "youtube", label: "YouTube", href: content.links.youtube },
    { key: "tiktok", label: "TikTok", href: content.links.tiktok },
    { key: "patreon", label: "Patreon", href: content.links.patreon },
  ];
}
