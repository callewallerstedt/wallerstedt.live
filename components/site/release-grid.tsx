import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import { accentVars } from "@/components/site/accent";
import { PlayButton } from "@/components/site/player";
import type { SiteRelease } from "@/lib/site/types";

function label(release: SiteRelease) {
  if (release.upcoming) return "Soon";
  if (release.format === "Version") return `${release.year} · ${release.tracks[0]?.variant ?? "Version"}`;
  return `${release.year} · ${release.format}`;
}

export function ReleaseGrid({ releases }: { releases: SiteRelease[] }) {
  return (
    <div className="wl-grid">
      {releases.map((release, index) => (
        <article className="wl-cover" key={release.slug} style={accentVars(release.accent)} data-reveal={index % 4}>
          <div className="wl-cover__media">
            <Image
              src={release.art}
              alt={`${release.title} cover art`}
              width={600}
              height={600}
              sizes="(max-width: 640px) 46vw, (max-width: 1100px) 30vw, 22vw"
            />
            <PlayButton
              slug={release.tracks[0].slug}
              queue={release.tracks.map((track) => track.slug)}
              label={release.title}
              className="wl-cover__play"
            />
          </div>
          <Link className="wl-cover__link" href={release.href as Route}>
            <h3>{release.title}</h3>
            <span>{label(release)}</span>
          </Link>
        </article>
      ))}
    </div>
  );
}
