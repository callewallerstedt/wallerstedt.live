import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How wallerstedt.live handles personal data.",
};

export default function PrivacyPage() {
  return (
    <>
      <section className="wl-head">
        <div className="wl-shell wl-head__inner">
          <p className="wl-eyebrow" data-wl-reveal="0">
            Privacy
          </p>
          <h1 className="wl-display wl-head__title" data-wl-reveal="1">
            Privacy policy
          </h1>
        </div>
      </section>

      <section className="wl-section wl-section--tight">
        <div className="wl-shell">
          <div style={{ display: "grid", gap: 20, maxWidth: "62ch" }} data-wl-reveal="0">
            <p className="wl-lede">
              wallerstedt.live is the artist site of Wallerstedt, run by Wallerstedt Productions AB (559559-7906),
              Kungsbacka, Sweden.
            </p>
            <p>
              <strong>Visitors.</strong> The public site counts page views without cookies that identify you. If you sign
              up for release updates, your email address is stored only to send those emails, and every email has an
              unsubscribe link.
            </p>
            <p>
              <strong>Private budgeting app.</strong> The site also hosts a private, password-protected budgeting tool used
              only by its owner. With the owner&apos;s own consent (BankID), it reads account balances and transactions from
              the owner&apos;s bank through Enable Banking (a licensed PSD2 account information provider). No one else&apos;s
              bank data is collected. The data is stored in an EU-hosted database, is never sold or shared, and access can
              be revoked at any time by disconnecting the bank.
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
