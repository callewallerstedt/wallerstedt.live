"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export function TikTokCover({
  src,
  className,
  wide = false,
}: {
  src: string | null;
  className?: string;
  wide?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "shrink-0 bg-muted ring-1 ring-foreground/8",
          wide ? "h-28 w-20 rounded-lg" : "size-12 rounded-md",
          className,
        )}
      />
    );
  }
  return (
    // TikTok CDN often blocks hotlinking; hide the thumb if the request fails.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className={cn(
        "shrink-0 bg-muted object-cover ring-1 ring-foreground/8",
        wide ? "h-28 w-20 rounded-lg" : "size-12 rounded-md",
        className,
      )}
      decoding="async"
      height={wide ? 144 : 48}
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={src}
      width={wide ? 80 : 48}
    />
  );
}
