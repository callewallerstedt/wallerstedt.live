import { PlatformIcon } from "@/components/icons";
import type { SocialLink } from "@/lib/site-data";

export function SocialIconRow({ links }: { links: SocialLink[] }) {
  return (
    <div className="icon-row" data-reveal>
      {links.map((item) => (
        <a
          key={item.label}
          className="icon-link"
          href={item.href}
          target="_blank"
          rel="noreferrer"
          aria-label={item.label}
          title={item.label}
        >
          <PlatformIcon platform={item.key} />
        </a>
      ))}
    </div>
  );
}
