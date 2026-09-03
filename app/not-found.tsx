import Link from "next/link";

import "./site.css";

export default function NotFound() {
  return (
    <div className="wl">
      <div className="wl-aura" aria-hidden="true" />
      <div className="wl-grain" aria-hidden="true" />
      <main className="wl-404">
        <div className="wl-404__inner">
          <p className="wl-eyebrow wl-eyebrow--bare">404</p>
          <h1 className="wl-display" style={{ fontSize: "clamp(2.6rem, 9vw, 7rem)" }}>
            Nothing here.
          </h1>
          <div className="wl-btn-row" style={{ justifyContent: "center" }}>
            <Link className="wl-btn wl-btn--solid" href="/">
              <span>Back to the music</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
