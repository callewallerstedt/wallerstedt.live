"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useActionState, useRef } from "react";

import { PlatformIcon } from "@/components/icons";
import { MailIcon } from "@/components/site/icons";
import { Marquee } from "@/components/site/marquee";
import { subscribeAction, type SubscribeState } from "@/app/updates/actions";
import type { SocialLink } from "@/lib/site-data";

const initialState: SubscribeState = { status: "idle", message: "" };

const footerLinks = [
  { href: "/music", label: "All music" },
  { href: "/playlists", label: "Playlists" },
  { href: "/updates", label: "Release updates" },
  { href: "/random", label: "Play something random" },
] as const;

export function SiteFooter({
  socials,
  contactEmail,
}: {
  socials: SocialLink[];
  contactEmail: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(subscribeAction, initialState);
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kept from the previous site: three quick taps on the copyright opens /admin.
  function onCopyrightClick() {
    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);

    if (clicks.current >= 3) {
      clicks.current = 0;
      timer.current = null;
      router.push("/admin" as Route);
      return;
    }

    timer.current = setTimeout(() => {
      clicks.current = 0;
      timer.current = null;
    }, 500);
  }

  return (
    <footer className="wl-footer" id="follow">
      <div className="wl-shell">
        <div className="wl-footer__grid">
          <div className="wl-footer__cta" data-wl-reveal="0">
            <p className="wl-eyebrow">Stay close</p>
            <h2 className="wl-h3">
              I send an email when there is new music. Nothing else, ever.
            </h2>
            <form className="wl-signup" action={formAction}>
              <div className="wl-field">
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  aria-label="Email address"
                  required
                />
                <button className="wl-btn wl-btn--solid" type="submit" disabled={pending}>
                  <span>{pending ? "Sending" : "Sign up"}</span>
                </button>
              </div>
              {state.message ? (
                <p
                  className={`wl-note ${state.status === "error" ? "wl-note--bad" : "wl-note--ok"}`}
                  aria-live="polite"
                >
                  {state.message}
                </p>
              ) : (
                <p className="wl-note">No spam. Unsubscribe whenever.</p>
              )}
            </form>

            <div className="wl-socials">
              {socials
                .filter((link) => link.href)
                .map((link) => (
                  <a
                    key={link.key}
                    className="wl-social"
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={link.label}
                    title={link.label}
                  >
                    <PlatformIcon platform={link.key} />
                  </a>
                ))}
              <a className="wl-social" href={`mailto:${contactEmail}`} aria-label="Email" title="Email">
                <MailIcon />
              </a>
            </div>
          </div>

          <nav className="wl-footer__links" aria-label="Footer">
            {footerLinks.map((link) => (
              <Link key={link.href} className="wl-link" href={link.href as Route}>
                {link.label}
              </Link>
            ))}
            <a className="wl-link" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
          </nav>
        </div>
      </div>

      <div className="wl-footer__wordmark">
        <Marquee items={["Wallerstedt", "Wallerstedt", "Wallerstedt"]} speed={38} display />
      </div>

      <div className="wl-shell">
        <div className="wl-footer__bottom">
          <button type="button" onClick={onCopyrightClick}>
            © {new Date().getFullYear()} Wallerstedt Productions AB
          </button>
          <span>Gothenburg, Sweden</span>
          <span>Built for quiet listening</span>
        </div>
      </div>
    </footer>
  );
}
