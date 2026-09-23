import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for wallerstedt.live.",
};

export default function TermsPage() {
  return (
    <>
      <section className="wl-head">
        <div className="wl-shell wl-head__inner">
          <p className="wl-eyebrow" data-wl-reveal="0">
            Terms
          </p>
          <h1 className="wl-display wl-head__title" data-wl-reveal="1">
            Terms of use
          </h1>
        </div>
      </section>

      <section className="wl-section wl-section--tight">
        <div className="wl-shell">
          <div style={{ display: "grid", gap: 20, maxWidth: "62ch" }} data-wl-reveal="0">
            <p className="wl-lede">
              wallerstedt.live is operated by Wallerstedt Productions AB (559559-7906), Kungsbacka, Sweden.
            </p>
            <p>
              The music, artwork and text on this site belong to Wallerstedt unless stated otherwise. You are welcome to
              listen, share links and embed the official players; please do not re-upload the recordings.
            </p>
            <p>
              The private areas of the site (company dashboard and budgeting app) are for the owner only. The budgeting
              app has read-only access to the owner&apos;s own bank accounts through Enable Banking and cannot move money.
              Figures and tips it shows are for personal overview, not financial advice.
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
