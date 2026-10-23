import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How wallerstedt.live handles personal data.",
};

export default function PrivacyPage() {
  return (
    <>
      <section className="wl-head">
        <div className="wl-shell">
          <h1 className="wl-display">
            Privacy policy
          </h1>
        </div>
      </section>

      <section className="wl-section wl-section--flush wl-prose">
        <div className="wl-shell">
          <div style={{ display: "grid", gap: 20, maxWidth: "62ch" }}>
            <p className="wl-muted">
              wallerstedt.live is the artist site of Wallerstedt, run by Wallerstedt Productions AB (559559-7906),
              Kungsbacka, Sweden.
            </p>
            <p>
              <strong>Visitors.</strong> The public site counts page views without cookies that identify you. If you sign
              up for release updates, your email address is stored only to send those emails, and every email has an
              unsubscribe link.
            </p>
            <p>
              <strong>Your rights.</strong> Under the GDPR you can ask what we hold about you, and have it corrected or
              deleted. Contact{" "}
              <a href="mailto:contact.wallerstedt@gmail.com">contact.wallerstedt@gmail.com</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
