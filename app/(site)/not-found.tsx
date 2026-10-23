import Link from "next/link";

export default function SiteNotFound() {
  return (
    <section className="wl-head wl-head--center">
      <div className="wl-shell">
        <h1 className="wl-display">Nothing here</h1>
        <p className="wl-muted" style={{ marginBottom: 28 }}>
          This page doesn&rsquo;t exist.
        </p>
        <div className="wl-btn-row" style={{ justifyContent: "center" }}>
          <Link className="wl-btn wl-btn--light" href="/music">
            <span>Music</span>
          </Link>
          <Link className="wl-btn" href="/random">
            <span>Play something</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
