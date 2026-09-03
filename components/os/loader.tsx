import Image from "next/image";

/**
 * The opening screen. The brand gradient sweeps around the logo's edge while
 * the first data is still on the wire.
 */
export function OsLoader({ label = "Öppnar…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4">
      <span aria-hidden className="os-ring size-[84px]">
        <span className="flex size-full items-center justify-center">
          <Image
            alt=""
            className="size-full rounded-full object-cover"
            height={64}
            priority
            src="/accounting-logo.png"
            width={64}
          />
        </span>
      </span>
      <p className="text-xs font-medium text-muted-foreground" role="status">
        {label}
      </p>
    </div>
  );
}

/** The same ring at row scale, for anywhere a section is still loading. */
export function OsSpinner({ size = 22 }: { size?: number }) {
  return (
    <span aria-hidden className="os-ring" style={{ width: size, height: size, padding: 2 }}>
      <span className="block size-full" style={{ padding: 0 }} />
    </span>
  );
}
