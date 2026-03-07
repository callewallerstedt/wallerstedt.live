import { redirect } from "next/navigation";

import { loginAction, logoutAction, saveSettingsAction } from "./actions";

import { catalogSongs, songs } from "@/lib/site-data";
import { getSiteSettings, isAdminAuthenticated, isAdminConfigured } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const authState = typeof params.auth === "string" ? params.auth : "";
  const savedState = typeof params.saved === "string" ? params.saved : "";
  const isConfigured = isAdminConfigured();
  const isAuthenticated = await isAdminAuthenticated();
  const settings = await getSiteSettings();

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
            <p className="lead">Use the password from `.env` to manage the homepage.</p>
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
              {authState === "error" ? <p className="status-copy">Wrong password.</p> : null}
              <button className="button button--primary" type="submit">
                Open admin
              </button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="song-main">
      <div className="container admin-shell">
        <section className="admin-panel" data-reveal>
          <div className="admin-panel__top">
            <div>
              <p className="eyebrow">Admin</p>
              <h1>Homepage controls</h1>
              <p className="lead">Choose the songs shown in the featured area and the spotlight tile at the top.</p>
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
          <form
            className="admin-form admin-form--wide"
            action={async (formData) => {
              "use server";
              await saveSettingsAction(formData);
              redirect("/admin?saved=1");
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
              <h2>Current homepage order</h2>
              <ul className="track-list">
                {settings.featuredSongOrder.map((slug, index) => (
                  <li key={slug}>
                    <span>{`0${index + 1}`}</span>
                    <strong>{songs[slug]?.title ?? slug}</strong>
                  </li>
                ))}
              </ul>
            </div>

            {savedState === "1" ? <p className="status-copy">Settings saved.</p> : null}
            <button className="button button--primary" type="submit">
              Save homepage
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
