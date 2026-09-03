import type { CSSProperties } from "react";

/**
 * Turns an "r g b" accent string into the three registered custom properties the
 * stylesheet interpolates, so a section can carry its own artwork colour.
 */
export function accentVars(accent: string): CSSProperties {
  const [r, g, b] = accent.split(" ");
  if (!r || !g || !b) {
    return {};
  }
  return {
    ["--wl-accent-r" as string]: r,
    ["--wl-accent-g" as string]: g,
    ["--wl-accent-b" as string]: b,
  } as CSSProperties;
}
