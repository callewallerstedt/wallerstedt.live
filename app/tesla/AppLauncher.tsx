"use client";

import { Icons } from "./TeslaIcons";
import type { LiveState } from "./types";

type AppLauncherProps = {
  live: LiveState;
  onOpenSettings: () => void;
};

export function AppLauncher({ live, onOpenSettings }: AppLauncherProps) {
  const shareLocation = async () => {
    const latitude = live.latitude;
    const longitude = live.longitude;
    const url = latitude != null && longitude != null
      ? `https://maps.apple.com/?ll=${latitude},${longitude}`
      : "https://www.wallerstedt.live/tesla";
    if (navigator.share) {
      await navigator.share({ title: live.destination_name || "Tesla location", text: live.destination_name || "Open this location", url }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(url).catch(() => undefined);
    }
  };

  return (
    <section className="apps-view-v2" aria-label="Driving app launcher">
      <header className="section-heading"><span><small>QUICK LAUNCH</small><h1>Apps</h1></span></header>
      <div className="launcher-grid">
        <a href="tesla://"><span className="launcher-icon tesla-app">T</span><span><strong>Tesla</strong><small>Vehicle controls</small></span></a>
        <a href="spotify://"><span className="launcher-icon spotify-app">◉</span><span><strong>Spotify</strong><small>Music</small></span></a>
        <a href="maps://"><span className="launcher-icon apple-maps-app">↗</span><span><strong>Apple Maps</strong><small>Navigation</small></span></a>
        <a href="https://maps.google.com"><span className="launcher-icon google-maps-app">G</span><span><strong>Google Maps</strong><small>Navigation</small></span></a>
        <a href="https://waze.com/ul"><span className="launcher-icon waze-app">W</span><span><strong>Waze</strong><small>Traffic</small></span></a>
        <a href="https://www.google.com/maps/search/Tesla+Supercharger+near+me"><span className="launcher-icon charge-app"><Icons.Bolt size={26} /></span><span><strong>Superchargers</strong><small>Find nearby</small></span></a>
        <button onClick={() => void shareLocation()}><span className="launcher-icon share-app">↑</span><span><strong>Share location</strong><small>Open iPhone share sheet</small></span></button>
        <button onClick={onOpenSettings}><span className="launcher-icon settings-app"><Icons.Settings size={26} /></span><span><strong>Settings</strong><small>Connection and voice</small></span></button>
      </div>
      <aside className="launcher-note"><Icons.Shield size={17} /><span><strong>Safe launcher</strong><small>iOS always asks before handing a link to another app.</small></span></aside>
    </section>
  );
}
