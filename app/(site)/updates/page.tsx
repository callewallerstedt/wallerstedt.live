import type { Metadata } from "next";

import { UpdatesForm } from "@/components/site/updates-form";

export const metadata: Metadata = {
  title: "Updates",
  description: "Get an email from Wallerstedt when there is new piano music. Nothing else.",
};

export default function UpdatesPage() {
  return (
    <>
      <section className="wl-head">
        <div className="wl-shell wl-head__inner">
          <p className="wl-eyebrow" data-wl-reveal="0">
            Updates
          </p>
          <h1 className="wl-display wl-head__title" data-wl-reveal="1">
            New music,
            <br />
            <em>first.</em>
          </h1>
        </div>
      </section>

      <section className="wl-section wl-section--tight">
        <div className="wl-shell">
          <div style={{ display: "grid", gap: 28, maxWidth: "56ch" }} data-wl-reveal="0">
            <p className="wl-lede">
              I send an email when a release is out, and nothing in between. No newsletters about
              nothing, no forwarding your address anywhere. Unsubscribe in one click.
            </p>
            <UpdatesForm />
          </div>
        </div>
      </section>
    </>
  );
}
