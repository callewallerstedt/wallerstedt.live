import type { PlatformKey } from "@/lib/site-data";

const baseProps = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  "aria-hidden": true,
} as const;

export function PlatformIcon({ platform }: { platform: PlatformKey }) {
  switch (platform) {
    case "spotify":
      return (
        <svg {...baseProps}>
          <path d="M12 1.75A10.25 10.25 0 1 0 22.25 12 10.26 10.26 0 0 0 12 1.75Zm4.83 14.78a.88.88 0 0 1-1.2.29 10.6 10.6 0 0 0-7.44-1.11.88.88 0 1 1-.38-1.71 12.36 12.36 0 0 1 8.66 1.31.88.88 0 0 1 .36 1.22Zm1.22-2.71a1.1 1.1 0 0 1-1.5.37 13.22 13.22 0 0 0-9.2-1.33 1.1 1.1 0 0 1-.53-2.13 15.4 15.4 0 0 1 10.72 1.55 1.1 1.1 0 0 1 .51 1.54Zm.15-2.83A15.64 15.64 0 0 0 6.41 9.18a1.32 1.32 0 0 1-.74-2.53 18.28 18.28 0 0 1 13.65 2.01 1.32 1.32 0 0 1-1.12 2.33Z" />
        </svg>
      );
    case "appleMusic":
      return (
        <svg {...baseProps}>
          <path d="M15.85 3.1 9.35 4.4a1.17 1.17 0 0 0-.95 1.15v9.1a2.85 2.85 0 1 0 1.5 2.5V8.47l5-1v5.19a2.85 2.85 0 1 0 1.5 2.49V4.26a1.16 1.16 0 0 0-.55-.99Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...baseProps}>
          <path d="M23 12.24s0-3.12-.4-4.63a3 3 0 0 0-2.1-2.1C19 5.1 12 5.1 12 5.1s-7 0-8.5.41a3 3 0 0 0-2.1 2.1C1 9.12 1 12.24 1 12.24s0 3.12.4 4.63a3 3 0 0 0 2.1 2.1c1.5.41 8.5.41 8.5.41s7 0 8.5-.41a3 3 0 0 0 2.1-2.1c.4-1.51.4-4.63.4-4.63Zm-13.24 3.5V8.74l6.09 3.5Z" />
        </svg>
      );
    case "amazonMusic":
      return (
        <svg {...baseProps}>
          <path d="M17.87 15.07a.78.78 0 0 0-.81-.13 12.27 12.27 0 0 1-9.65-.28.78.78 0 1 0-.64 1.42 13.8 13.8 0 0 0 10.87.32.78.78 0 0 0 .23-1.33Z" />
          <path d="M17.54 18.07a.56.56 0 0 0-.61-.11 10.74 10.74 0 0 1-8.33-.19.56.56 0 1 0-.49 1.01 11.86 11.86 0 0 0 9.19.23.56.56 0 0 0 .24-.94Z" />
          <path d="M12.28 3.02a3.8 3.8 0 0 0-3.18 1.65 4.37 4.37 0 0 0-3.44-1.38 4.77 4.77 0 0 0-2.38.54l.73 1.56A3 3 0 0 1 5.51 5c1.52 0 2.42 1.1 2.42 2.83v6.04h1.85V8.28c0-2.12 1.02-3.45 2.67-3.45 1.47 0 2.27 1 2.27 2.67v6.37h1.86V7.26c0-2.7-1.47-4.24-4.3-4.24Z" />
        </svg>
      );
    case "deezer":
      return (
        <svg {...baseProps}>
          <path d="M3 14h3.8v2.8H3Zm4.3-3h3.8v5.8H7.3Zm4.3-4h3.8v9.8h-3.8Zm4.3 2h3.8v7.8h-3.8ZM3 18.2h16.7V21H3Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...baseProps}>
          <path d="M14.5 2h2.6a5.2 5.2 0 0 0 4.15 4.09v2.64a7.66 7.66 0 0 1-4.15-1.2v7.02a6.05 6.05 0 1 1-6.05-6.05c.27 0 .55.02.8.06v2.64a3.34 3.34 0 1 0 2.65 3.26Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...baseProps}>
          <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 1.8A3.2 3.2 0 0 0 3.8 7v10A3.2 3.2 0 0 0 7 20.2h10A3.2 3.2 0 0 0 20.2 17V7A3.2 3.2 0 0 0 17 3.8Zm10.6 1.5a1.1 1.1 0 1 1-1.1 1.1 1.1 1.1 0 0 1 1.1-1.1ZM12 6.5A5.5 5.5 0 1 1 6.5 12 5.5 5.5 0 0 1 12 6.5Zm0 1.8A3.7 3.7 0 1 0 15.7 12 3.7 3.7 0 0 0 12 8.3Z" />
        </svg>
      );
    case "patreon":
      return (
        <svg {...baseProps}>
          <path d="M14.67 2.04a6.15 6.15 0 1 0 6.15 6.15 6.15 6.15 0 0 0-6.15-6.15ZM3.18 3.06H6.7V21H3.18Z" />
        </svg>
      );
    case "soundcloud":
      return (
        <svg {...baseProps}>
          <path d="M9 8.15a5.5 5.5 0 0 1 9.6 3.65 3.3 3.3 0 0 1 1.75 6.1H4a2.7 2.7 0 0 1-.3-5.38A5 5 0 0 1 9 8.15Z" />
        </svg>
      );
    case "tidal":
      return (
        <svg {...baseProps}>
          <path d="M7.2 4.2 10.6 7.6 7.2 11 3.8 7.6Zm9.6 0 3.4 3.4-3.4 3.4-3.4-3.4Zm-4.8 4.8 3.4 3.4-3.4 3.4-3.4-3.4Zm0 6 3.4 3.4-3.4 3.4-3.4-3.4Z" />
        </svg>
      );
    default:
      return null;
  }
}

export const platformLabel: Record<PlatformKey, string> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  youtube: "YouTube",
  amazonMusic: "Amazon Music",
  deezer: "Deezer",
  tiktok: "TikTok",
  instagram: "Instagram",
  patreon: "Patreon",
  soundcloud: "SoundCloud",
  tidal: "TIDAL",
};
