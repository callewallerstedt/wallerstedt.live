import Link from "next/link";

export default function SiteNotFound() {
  return (
    <section className="wl-404">
      <div className="wl-404__inner">
        <p className="wl-eyebrow wl-eyebrow--bare">404</p>
        <h1 className="wl-display" style={{ fontSize: "clamp(2.6rem, 9vw, 7rem)" }}>
          That one isn&rsquo;t <em>written</em> yet.
        </h1>
        <p className="wl-lede" style={{ textAlign: "center" }}>
          The page you were after does not exist. Try the catalogue, or let me pick something for
          you.
        </p>
        <div className="wl-btn-row" style={{ justifyContent: "center" }}>
          <Link className="wl-btn wl-btn--solid" href="/music">
            <span>All music</span>
          </Link>
          <Link className="wl-btn" href="/random">
            <span>Surprise me</span>
          </Link>
          <Link className="wl-btn wl-btn--ghost" href="/">
            <span>Home</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
