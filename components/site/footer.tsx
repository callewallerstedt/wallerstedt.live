"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { useRef } from "react";

import { PlatformIcon } from "@/components/icons";
import { MailIcon } from "@/components/site/icons";
import { UpdatesForm } from "@/components/site/updates-form";
import type { SocialLink } from "@/lib/site-data";

export function SiteFooter({
  socials,
  contactEmail,
}: {
  socials: SocialLink[];
  contactEmail: string;
}) {
  const router = useRouter();
  // Home already has the signup band higher up, so the footer skips the form there.
  const isHome = usePathname() === "/";
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Three quick taps on the copyright opens /admin.
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
        <div className="wl-follow">
          {isHome ? (
            <h2 className="wl-h2" data-reveal="0">
              Follow along
            </h2>
          ) : (
            <>
              <h2 className="wl-h2" data-reveal="0">
                Get new songs first
              </h2>
              <div data-reveal="2">
                <UpdatesForm source="footer" />
              </div>
            </>
          )}

          <div className="wl-socials" data-reveal="3">
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

        <div className="wl-footer__bottom">
          <button type="button" onClick={onCopyrightClick}>
            © {new Date().getFullYear()} Wallerstedt
          </button>
          <Link href="/privacy">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
