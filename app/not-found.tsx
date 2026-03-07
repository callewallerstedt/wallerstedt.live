import Link from "next/link";

export default function NotFound() {
  return (
    <main className="song-main">
      <div className="container section-heading" data-reveal>
        <p className="eyebrow">Not found</p>
        <h2>That piece is not here.</h2>
        <p>Try the homepage or jump to a random song.</p>
        <div className="button-row">
          <Link className="button button--primary" href="/">
            Back home
          </Link>
          <Link className="button button--secondary" href="/random">
            Random song
          </Link>
        </div>
      </div>
    </main>
  );
}
