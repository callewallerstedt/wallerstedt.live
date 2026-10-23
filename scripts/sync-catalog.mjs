#!/usr/bin/env node
/**
 * Pull new Wallerstedt releases into the site catalogue.
 *
 *   npm run music:catalog          # add anything new, write files
 *   npm run music:catalog -- --dry # just report what's missing
 *
 * Spotify's public artist page lists the latest releases, and each album's
 * embed page has its tracks, preview clips and cover colour — no API key
 * needed. Apple's public lookup API supplies release dates and Apple Music
 * links. Only releases the site doesn't know yet are added; existing entries
 * are never touched, so hand edits stay put.
 *
 * Runs weekly from .github/workflows/sync-music.yml; a commit with changes
 * triggers a normal Vercel deploy.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SPOTIFY_ARTIST_ID = "7qBBYMwk5wXAjSXWWhPCxK";
const APPLE_ARTIST_ID = "1689400214";
const UA = { "user-agent": "Mozilla/5.0 (compatible; wallerstedt.live)" };

const root = process.cwd();
const catalogPath = resolve(root, "lib/song-catalog.json");
const extraPath = resolve(root, "lib/catalog-extra.json");
const dry = process.argv.includes("--dry");

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const extra = JSON.parse(readFileSync(extraPath, "utf8"));

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Apple writes versions as "Title (sped up)", Spotify as "Title - sped up". Compare them as one. */
function normalise(value) {
  return value
    .toLowerCase()
    .replace(/\s*[-(]\s*(slowed \+ reverb|sped up|piano version|instrumental)\)?\s*$/, "$1")
    .replace(/[^a-z0-9]+/g, "");
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

async function text(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

async function spotifyAlbum(id) {
  const html = await text(`https://open.spotify.com/embed/album/${id}`);
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  return JSON.parse(match[1]).props.pageProps.state.data.entity;
}

async function spotifyReleaseIds() {
  const html = await text(`https://open.spotify.com/artist/${SPOTIFY_ARTIST_ID}`);
  const match = html.match(/<script id="initialState" type="text\/plain">([^<]*)<\/script>/);
  const state = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  const discography = state.entities.items[`spotify:artist:${SPOTIFY_ARTIST_ID}`].discography;
  const uris = [
    discography.latest?.uri,
    ...["albums", "singles", "popularReleasesAlbums", "compilations"].flatMap((group) =>
      (discography[group]?.items ?? []).flatMap((item) => (item.releases?.items ?? [item]).map((release) => release.uri)),
    ),
  ];
  return [...new Set(uris.filter(Boolean).map((uri) => uri.split(":").pop()))];
}

const knownAlbums = new Set(
  catalog.map((song) => song.releasePlatforms?.spotify?.match(/album\/([A-Za-z0-9]+)/)?.[1]).filter(Boolean),
);
const knownTracks = new Set(catalog.map((song) => song.spotifyId));
// The same song re-released as its own single gets a new Spotify id; the title still matches.
const knownTitles = new Set(catalog.map((song) => normalise(song.title)));

const albumIds = (await spotifyReleaseIds()).filter((id) => !knownAlbums.has(id));
const fresh = [];
for (const id of albumIds) {
  const album = await spotifyAlbum(id);
  const tracks = (album.trackList ?? []).filter(
    (track) => !knownTracks.has(track.uri.split(":").pop()) && !knownTitles.has(normalise(track.title)),
  );
  if (tracks.length) fresh.push({ id, album, tracks });
}

console.log(fresh.length ? `${fresh.length} new release(s) on Spotify:` : "Catalogue is up to date.");
for (const { album, tracks } of fresh) console.log(`  + ${album.name}: ${tracks.map((t) => t.title).join(", ")}`);

if (!dry && fresh.length) await addFresh();

async function addFresh() {
  const lookup = JSON.parse(
    await text(`https://itunes.apple.com/lookup?id=${APPLE_ARTIST_ID}&entity=song&limit=200&country=se`),
  );
  const apple = new Map(
    lookup.results.filter((row) => row.wrapperType === "track").map((row) => [normalise(row.trackName), row]),
  );

  const artDir = resolve(root, "public/media/songs");
  mkdirSync(artDir, { recursive: true });
  const added = [];

  for (const { id: albumId, album, tracks } of fresh) {
    const cover = album.visualIdentity?.image?.sort((a, b) => b.maxWidth - a.maxWidth)[0]?.url;
    const base = album.visualIdentity?.backgroundBase;
    const rgb = base ? [base.red, base.green, base.blue] : null;

    for (const track of tracks) {
      const spotifyId = track.uri.split(":").pop();
      let slug = slugify(track.title);
      while (catalog.some((song) => song.slug === slug)) slug += "-2";

      const appleRow = apple.get(normalise(track.title));
      const kind = appleRow?.collectionName.match(/ - (Single|EP)$/)?.[1] ?? (album.trackList.length > 2 ? "EP" : "Single");
      const art = `/media/songs/${slug}.jpg`;
      if (cover) {
        const res = await fetch(cover);
        if (res.ok) writeFileSync(resolve(root, `public${art}`), Buffer.from(await res.arrayBuffer()));
      }

      catalog.push({
        slug,
        spotifyId,
        title: track.title,
        subtitle: appleRow?.collectionName ?? `${album.name} - ${kind}`,
        releaseDate: formatDate(appleRow?.releaseDate ?? new Date().toISOString()),
        art,
        blurb: `${track.title} by Wallerstedt.`,
        note: "",
        embed: `https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0`,
        allPlatforms: `https://song.link/s/${spotifyId}`,
        platforms: {
          spotify: `https://open.spotify.com/track/${spotifyId}`,
          ...(appleRow ? { appleMusic: appleRow.trackViewUrl } : {}),
        },
        releaseArt: art,
        releaseAllPlatforms: `https://album.link/s/${albumId}`,
        releasePlatforms: {
          spotify: `https://open.spotify.com/album/${albumId}`,
          ...(appleRow ? { appleMusic: appleRow.collectionViewUrl } : {}),
        },
      });

      extra[slug] = { preview: track.audioPreview?.url ?? null, durationMs: track.duration ?? null, rgb };
      added.push(track.title);
    }
  }

  catalog.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(extraPath, `${JSON.stringify(extra, null, 2)}\n`);
  console.log(`Added ${added.length}: ${added.join(", ")}`);
}
