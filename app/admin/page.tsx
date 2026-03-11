import Link from "next/link";
import { redirect } from "next/navigation";

import { addSongAction, loginAction, logoutAction, saveSettingsAction, saveSiteContentAction } from "./actions";

import { getSiteContent } from "@/lib/site-content";
import { getCatalogSongs } from "@/lib/site-data";
import { getSiteSettings, isAdminAuthenticated, isAdminConfigured } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

type AdminTab = "homepage" | "content" | "songs" | "pages";

const adminTabs: Array<{ key: AdminTab; label: string; description: string }> = [
  { key: "homepage", label: "Homepage", description: "Hero and featured slots" },
  { key: "content", label: "Site content", description: "Bio, links, playlists" },
  { key: "songs", label: "Songs", description: "Add songs and review catalog" },
  { key: "pages", label: "Pages", description: "Preview hidden routes and drafts" },
];

function getTabValue(value: string | string[] | undefined): AdminTab {
  const tab = typeof value === "string" ? value : "";
  return adminTabs.some((item) => item.key === tab) ? (tab as AdminTab) : "homepage";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const authState = typeof params.auth === "string" ? params.auth : "";
  const savedState = typeof params.saved === "string" ? params.saved : "";
  const contentSavedState = typeof params.contentSaved === "string" ? params.contentSaved : "";
  const songSavedState = typeof params.songSaved === "string" ? params.songSaved : "";
  const songSlugState = typeof params.songSlug === "string" ? params.songSlug : "";
  const songErrorState = typeof params.songError === "string" ? params.songError : "";
  const activeTab = getTabValue(params.tab);
  const isConfigured = isAdminConfigured();
  const isAuthenticated = await isAdminAuthenticated();

  if (!isConfigured) {
    return (
      <main className="song-main">
        <div className="container admin-shell">
          <section className="admin-panel" data-reveal>
            <p className="eyebrow">Admin</p>
            <h1>Admin password is not configured.</h1>
            <p className="lead">Set `ADMIN_PASSWORD` in your `.env` file, then reload `/admin`.</p>
          </section>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="song-main">
        <div className="container admin-shell">
          <section className="admin-panel" data-reveal>
            <p className="eyebrow">Admin</p>
            <h1>Sign in</h1>
            <p className="lead">Use the password from `.env` to manage the site.</p>
            <form
              className="admin-form"
              action={async (formData) => {
                "use server";
                const result = await loginAction(formData);
                redirect(result.ok ? "/admin" : "/admin?auth=error");
              }}
            >
              <label className="field">
                <span>Password</span>
                <input name="password" type="password" required />
              </label>
              {authState === "error" ? <p className="status-copy status-copy--error">Wrong password.</p> : null}
              <button className="button button--primary" type="submit">
                Open admin
              </button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  const [settings, siteContent, catalogSongs] = await Promise.all([getSiteSettings(), getSiteContent(), getCatalogSongs()]);
  const songs = Object.fromEntries(catalogSongs.map((song) => [song.slug, song]));

  return (
    <main className="song-main">
      <div className="container admin-shell">
        <section className="admin-panel admin-panel--header" data-reveal>
          <div className="admin-panel__top">
            <div>
              <p className="eyebrow">Admin</p>
              <h1>Site manager</h1>
              <p className="lead">Edit the homepage, public copy, and music catalog from one place.</p>
            </div>
            <form
              action={async () => {
                "use server";
                await logoutAction();
                redirect("/admin");
              }}
            >
              <button className="button button--ghost" type="submit">
                Sign out
              </button>
            </form>
          </div>

          <nav className="admin-tabs" aria-label="Admin sections">
            {adminTabs.map((tab) => (
              <Link
                key={tab.key}
                className={tab.key === activeTab ? "admin-tab admin-tab--active" : "admin-tab"}
                href={`/admin?tab=${tab.key}`}
              >
                <strong>{tab.label}</strong>
                <span>{tab.description}</span>
              </Link>
            ))}
          </nav>
        </section>

        {activeTab === "homepage" ? (
          <section className="admin-panel" data-reveal>
            <div className="admin-panel__top">
              <div>
                <p className="eyebrow">Homepage</p>
                <h2>Featured slots</h2>
                <p className="lead">Choose the songs shown in the spotlight tile and featured cards.</p>
              </div>
            </div>
            <form
              className="admin-form admin-form--wide"
              action={async (formData) => {
                "use server";
                await saveSettingsAction(formData);
                redirect("/admin?tab=homepage&saved=1");
              }}
            >
              <div className="admin-grid">
                <label className="field">
                  <span>Hero spotlight song</span>
                  <select name="heroFeaturedSlug" defaultValue={settings.heroFeaturedSlug}>
                    {catalogSongs.map((song) => (
                      <option key={song.slug} value={song.slug}>
                        {song.title}
                      </option>
                    ))}
                  </select>
                </label>

                {[0, 1, 2, 3].map((index) => (
                  <label className="field" key={index}>
                    <span>{`Featured slot ${index + 1}`}</span>
                    <select name={`featuredSong${index + 1}`} defaultValue={settings.featuredSongOrder[index] ?? ""}>
                      {catalogSongs.map((song) => (
                        <option key={song.slug} value={song.slug}>
                          {song.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="admin-preview">
                <h3>Current homepage order</h3>
                <ul className="track-list">
                  {settings.featuredSongOrder.map((slug, index) => (
                    <li key={slug}>
                      <span>{`0${index + 1}`}</span>
                      <strong>{songs[slug]?.title ?? slug}</strong>
                    </li>
                  ))}
                </ul>
              </div>

              {savedState === "1" ? <p className="status-copy">Homepage settings saved.</p> : null}
              <button className="button button--primary" type="submit">
                Save homepage
              </button>
            </form>
          </section>
        ) : null}

        {activeTab === "content" ? (
          <section className="admin-panel" data-reveal>
            <div className="admin-panel__top">
              <div>
                <p className="eyebrow">Site content</p>
                <h2>Links and copy</h2>
                <p className="lead">Edit the public-facing text, contact email, social links, and playlist cards here.</p>
              </div>
            </div>
            <form
              className="admin-form admin-form--wide"
              action={async (formData) => {
                "use server";
                await saveSiteContentAction(formData);
                redirect("/admin?tab=content&contentSaved=1");
              }}
            >
              <section className="admin-group">
                <div className="admin-group__heading">
                  <h3>Profile</h3>
                  <p>These fields affect the homepage copy and footer contact details.</p>
                </div>
                <div className="admin-grid">
                  <label className="field">
                    <span>Hero heading</span>
                    <input name="heroHeading" defaultValue={siteContent.heroHeading} />
                  </label>
                  <label className="field">
                    <span>Tagline</span>
                    <input name="tagline" defaultValue={siteContent.tagline} />
                  </label>
                  <label className="field field--full">
                    <span>Bio</span>
                    <textarea name="bio" defaultValue={siteContent.bio} rows={4}></textarea>
                  </label>
                  <label className="field">
                    <span>Contact email</span>
                    <input name="contactEmail" type="email" defaultValue={siteContent.contactEmail} />
                  </label>
                </div>
              </section>

              <section className="admin-group">
                <div className="admin-group__heading">
                  <h3>Main links</h3>
                  <p>Used in the homepage hero buttons and follow section.</p>
                </div>
                <div className="admin-grid">
                  <label className="field">
                    <span>Spotify</span>
                    <input name="linkSpotify" defaultValue={siteContent.links.spotify} />
                  </label>
                  <label className="field">
                    <span>Apple Music</span>
                    <input name="linkAppleMusic" defaultValue={siteContent.links.appleMusic} />
                  </label>
                  <label className="field">
                    <span>Patreon</span>
                    <input name="linkPatreon" defaultValue={siteContent.links.patreon} />
                  </label>
                  <label className="field">
                    <span>Instagram</span>
                    <input name="linkInstagram" defaultValue={siteContent.links.instagram} />
                  </label>
                  <label className="field">
                    <span>YouTube</span>
                    <input name="linkYouTube" defaultValue={siteContent.links.youtube} />
                  </label>
                  <label className="field">
                    <span>TikTok</span>
                    <input name="linkTikTok" defaultValue={siteContent.links.tiktok} />
                  </label>
                </div>
              </section>

              <section className="admin-group">
                <div className="admin-group__heading">
                  <h3>Playlists</h3>
                  <p>Edit the cards shown on the playlists page.</p>
                </div>
                <div className="admin-stack">
                  {siteContent.playlists.map((playlist, index) => {
                    const number = index + 1;

                    return (
                      <div className="admin-subgroup" key={playlist.title + number}>
                        <h4>{`Playlist ${number}`}</h4>
                        <div className="admin-grid">
                          <label className="field">
                            <span>Title</span>
                            <input name={`playlist${number}Title`} defaultValue={playlist.title} />
                          </label>
                          <label className="field">
                            <span>Button label</span>
                            <input name={`playlist${number}Label`} defaultValue={playlist.label} />
                          </label>
                          <label className="field field--full">
                            <span>Description</span>
                            <textarea name={`playlist${number}Description`} defaultValue={playlist.description} rows={3}></textarea>
                          </label>
                          <label className="field field--full">
                            <span>Link</span>
                            <input name={`playlist${number}Href`} defaultValue={playlist.href} />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {contentSavedState === "1" ? <p className="status-copy">Site content saved.</p> : null}
              <button className="button button--primary" type="submit">
                Save site content
              </button>
            </form>
          </section>
        ) : null}

        {activeTab === "songs" ? (
          <section className="admin-panel" data-reveal>
            <div className="admin-panel__top">
              <div>
                <p className="eyebrow">Songs</p>
                <h2>Add new music</h2>
                <p className="lead">Add singles or EP tracks here. New songs will get real routes automatically.</p>
              </div>
            </div>

            <div className="admin-note-grid">
              <article className="admin-note-card">
                <h3>For a single</h3>
                <p>Use the same name for song title and release title, keep the release type as `Single`, and leave release overrides empty.</p>
              </article>
              <article className="admin-note-card">
                <h3>For an EP or album track</h3>
                <p>Put the track links in the main link fields, then add album-level Spotify and Apple links in release overrides so `/music/...` stays correct.</p>
              </article>
            </div>

            <form
              className="admin-form admin-form--wide"
              action={async (formData) => {
                "use server";
                const result = await addSongAction(formData);
                const query = new URLSearchParams({ tab: "songs" });

                if (result.ok) {
                  query.set("songSaved", "1");
                  query.set("songSlug", result.song.slug);
                } else {
                  query.set("songError", result.message);
                }

                redirect(`/admin?${query.toString()}`);
              }}
            >
              <section className="admin-group">
                <div className="admin-group__heading">
                  <h3>Core info</h3>
                  <p>These fields create the song page and determine how it appears across the site.</p>
                </div>
                <div className="admin-grid">
                  <label className="field">
                    <span>Song title</span>
                    <input name="title" required />
                  </label>
                  <label className="field">
                    <span>Slug</span>
                    <input name="slug" placeholder="optional-auto-from-title" />
                  </label>
                  <label className="field">
                    <span>Release title</span>
                    <input name="releaseTitle" placeholder="after dark" required />
                  </label>
                  <label className="field">
                    <span>Release type</span>
                    <select name="releaseType" defaultValue="Single">
                      <option value="Single">Single</option>
                      <option value="EP">EP</option>
                      <option value="Album">Album</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Release date</span>
                    <input name="releaseDate" type="date" required />
                  </label>
                  <label className="field">
                    <span>Cover art path</span>
                    <input name="art" placeholder="/media/songs/new-song.jpg" required />
                  </label>
                  <label className="field field--full">
                    <span>Blurb</span>
                    <textarea name="blurb" rows={3} placeholder="Short description used for metadata and previews."></textarea>
                  </label>
                  <label className="field field--full">
                    <span>Optional note</span>
                    <textarea name="note" rows={3} placeholder="Extra context if you want it stored with the song."></textarea>
                  </label>
                </div>
              </section>

              <section className="admin-group">
                <div className="admin-group__heading">
                  <h3>Track links</h3>
                  <p>Use track-level links here so the song page opens the actual song, not the whole release.</p>
                </div>
                <div className="admin-grid">
                  <label className="field">
                    <span>Spotify track link</span>
                    <input name="spotifyHref" required />
                  </label>
                  <label className="field">
                    <span>Spotify ID</span>
                    <input name="spotifyId" placeholder="optional-auto-from-link" />
                  </label>
                  <label className="field">
                    <span>Apple Music link</span>
                    <input name="appleMusicHref" />
                  </label>
                  <label className="field">
                    <span>Amazon Music link</span>
                    <input name="amazonMusicHref" />
                  </label>
                  <label className="field">
                    <span>Deezer link</span>
                    <input name="deezerHref" />
                  </label>
                  <label className="field">
                    <span>TIDAL link</span>
                    <input name="tidalHref" />
                  </label>
                  <label className="field">
                    <span>SoundCloud link</span>
                    <input name="soundcloudHref" />
                  </label>
                  <label className="field">
                    <span>All-platforms link</span>
                    <input name="allPlatforms" placeholder="album.link or feature.fm" />
                  </label>
                  <label className="field field--full">
                    <span>Embed URL</span>
                    <input name="embed" placeholder="optional-auto-from-Spotify-link" />
                  </label>
                </div>
              </section>

              <section className="admin-group">
                <div className="admin-group__heading">
                  <h3>Release overrides</h3>
                  <p>Only fill these when the song belongs to an EP or album and the release page should use album-level art or links.</p>
                </div>
                <div className="admin-grid">
                  <label className="field">
                    <span>Release art path</span>
                    <input name="releaseArt" placeholder="/media/after-dark.jpg" />
                  </label>
                  <label className="field">
                    <span>Release all-platforms link</span>
                    <input name="releaseAllPlatforms" />
                  </label>
                  <label className="field">
                    <span>Release Spotify link</span>
                    <input name="releaseSpotifyHref" placeholder="album link for EP/album pages" />
                  </label>
                  <label className="field">
                    <span>Release Apple Music link</span>
                    <input name="releaseAppleMusicHref" />
                  </label>
                  <label className="field">
                    <span>Release Amazon Music link</span>
                    <input name="releaseAmazonMusicHref" />
                  </label>
                  <label className="field">
                    <span>Release Deezer link</span>
                    <input name="releaseDeezerHref" />
                  </label>
                  <label className="field">
                    <span>Release SoundCloud link</span>
                    <input name="releaseSoundcloudHref" />
                  </label>
                  <label className="field">
                    <span>Release TIDAL link</span>
                    <input name="releaseTidalHref" />
                  </label>
                </div>
              </section>

              {songSavedState === "1" ? (
                <p className="status-copy">
                  Song saved.
                  {songSlugState ? (
                    <>
                      {" "}
                      <Link className="text-link" href={`/${songSlugState}`}>
                        Open song page
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : null}
              {songErrorState ? <p className="status-copy status-copy--error">{songErrorState}</p> : null}

              <button className="button button--primary" type="submit">
                Add song
              </button>
            </form>

            <section className="admin-group admin-group--catalog">
              <div className="admin-group__heading">
                <h3>Current catalog</h3>
                <p>{`${catalogSongs.length} songs in the live catalog, newest first.`}</p>
              </div>
              <div className="admin-song-list">
                {catalogSongs.map((song) => (
                  <article className="admin-song-card" key={song.slug}>
                    <div className="admin-song-card__copy">
                      <div>
                        <p className="eyebrow">{song.releaseDate}</p>
                        <h4>{song.title}</h4>
                        <p>{song.subtitle}</p>
                      </div>
                      <code>{song.slug}</code>
                    </div>
                    <div className="admin-song-card__actions">
                      <Link className="button button--ghost" href={`/${song.slug}`}>
                        Open page
                      </Link>
                      <a className="button button--ghost" href={song.platforms.spotify ?? song.allPlatforms} target="_blank" rel="noreferrer">
                        Spotify
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === "pages" ? (
          <section className="admin-panel" data-reveal>
            <div className="admin-panel__top">
              <div>
                <p className="eyebrow">Pages</p>
                <h2>Hidden routes</h2>
                <p className="lead">Preview draft pages here before you link them anywhere on the public site.</p>
              </div>
            </div>

            <div className="admin-note-grid">
              <article className="admin-note-card">
                <p className="eyebrow">Draft page</p>
                <h3>Learn Piano</h3>
                <p>
                  The new course-style page lives at <code>/learn</code>. It is not shown in the public header and it is
                  marked as non-indexed for now.
                </p>
                <div className="admin-page-actions">
                  <Link className="button button--primary" href="/learn">
                    Open /learn
                  </Link>
                  <Link className="button button--ghost" href="/updates">
                    Open waitlist
                  </Link>
                </div>
              </article>

              <article className="admin-note-card">
                <p className="eyebrow">Status</p>
                <h3>Still hidden publicly</h3>
                <p>
                  The route is intentionally left out of public navigation and the sitemap so it can stay as a soft-launch
                  draft.
                </p>
                <p>
                  When you want it public later, the next step is just adding it to the main navigation and removing the
                  noindex setup.
                </p>
              </article>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
