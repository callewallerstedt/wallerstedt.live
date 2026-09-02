import Image from "next/image";

import { cn } from "@/lib/utils";

export function OsBrandMark({
  size = 38,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative shrink-0 overflow-hidden rounded-[11px] bg-card", className)}
      style={{ width: size, height: size }}
    >
      <Image
        alt=""
        className="size-full object-cover"
        height={size}
        priority
        src="/accounting-logo.png"
        width={size}
      />
    </span>
  );
}

export function OsBrandLockup({
  compact = false,
  subtitle = "Bolag",
}: {
  compact?: boolean;
  subtitle?: string;
}) {
  if (compact) {
    return <OsBrandMark size={32} />;
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <OsBrandMark />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold leading-tight">Wallerstedt</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
