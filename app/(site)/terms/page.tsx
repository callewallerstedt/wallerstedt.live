import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for wallerstedt.live.",
};

export default function TermsPage() {
  return (
    <>
      <section className="wl-head">
        <div className="wl-shell">
          <h1 className="wl-display">
            Terms of use
          </h1>
        </div>
      </section>

      <section className="wl-section wl-section--flush wl-prose">
        <div className="wl-shell">
          <div style={{ display: "grid", gap: 20, maxWidth: "62ch" }}>
            <p className="wl-muted">
              wallerstedt.live is operated by Wallerstedt Productions AB (559559-7906), Kungsbacka, Sweden.
            </p>
            <p>
              The music, artwork and text on this site belong to Wallerstedt unless stated otherwise. You are welcome to
              listen, share links and embed the official players; please do not re-upload the recordings.
            </p>
            <p>
              The site is provided as is. Questions:{" "}
              <a href="mailto:contact.wallerstedt@gmail.com">contact.wallerstedt@gmail.com</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
