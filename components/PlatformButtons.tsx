import type { Song } from "@/lib/site-data";
import type { PlatformKey } from "@/lib/site-data";
import { PlatformIcon, platformLabel } from "@/components/icons";

const preferredOrder = ["spotify", "appleMusic", "amazonMusic", "deezer", "soundcloud", "tidal"] as const;

export function PlatformButtons({
  platforms,
  exclude = [],
}: {
  platforms: Song["platforms"];
  exclude?: readonly PlatformKey[];
}) {
  return (
    <div className="platform-grid">
      {preferredOrder
        .filter((key) => platforms[key] && !exclude.includes(key))
        .map((key) => (
          <a key={key} className="platform-button" href={platforms[key]!} target="_blank" rel="noreferrer">
            <span className="platform-icon"><PlatformIcon platform={key} /></span>
            <span>{platformLabel[key]}</span>
          </a>
        ))}
    </div>
  );
}
