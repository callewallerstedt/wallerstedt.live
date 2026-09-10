/**
 * Chrome is already on screen (sidebar / tab bar). This is the content-area
 * placeholder so a tab tap does not flash a logo spinner.
 */
export function OsPageSkeleton() {
  return (
    <div
      aria-busy
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 px-3 pt-2 sm:px-4 sm:pt-3"
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        paddingBottom: "calc(5.25rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="h-6 w-28 animate-pulse rounded-md bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-52 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Öppnar…</span>
    </div>
  );
}
