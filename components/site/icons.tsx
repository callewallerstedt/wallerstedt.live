const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  "aria-hidden": true,
} as const;

export function PlayIcon() {
  return (
    <svg {...base} viewBox="0 0 12 14">
      <path d="M0 .8a.8.8 0 0 1 1.22-.68l10.1 6.2a.8.8 0 0 1 0 1.36l-10.1 6.2A.8.8 0 0 1 0 13.2Z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...base} viewBox="0 0 12 14">
      <path d="M0 .9A.9.9 0 0 1 .9 0h2.3a.9.9 0 0 1 .9.9v12.2a.9.9 0 0 1-.9.9H.9a.9.9 0 0 1-.9-.9Zm7.9 0A.9.9 0 0 1 8.8 0h2.3a.9.9 0 0 1 .9.9v12.2a.9.9 0 0 1-.9.9H8.8a.9.9 0 0 1-.9-.9Z" fill="currentColor" />
    </svg>
  );
}

export function PrevIcon() {
  return (
    <svg {...base} viewBox="0 0 24 24">
      <path d="M18.6 4.3a.9.9 0 0 1 1.4.75v13.9a.9.9 0 0 1-1.4.75L8.5 13.1v5.85a.9.9 0 0 1-1.4.75L6 19V5l1.1-.7a.9.9 0 0 1 1.4.75v5.85Z" fill="currentColor" />
      <path d="M5 4.6v14.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function NextIcon() {
  return (
    <svg {...base} viewBox="0 0 24 24">
      <path d="M5.4 4.3a.9.9 0 0 0-1.4.75v13.9a.9.9 0 0 0 1.4.75l10.1-6.6v5.85a.9.9 0 0 0 1.4.75L18 19V5l-1.1-.7a.9.9 0 0 0-1.4.75v5.85Z" fill="currentColor" />
      <path d="M19 4.6v14.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...base}>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowIcon({ direction = "right" }: { direction?: "right" | "left" | "down" }) {
  const rotation = direction === "left" ? 180 : direction === "down" ? 90 : 0;
  return (
    <svg {...base} viewBox="0 0 24 24" style={{ transform: `rotate(${rotation}deg)`, width: "1em", height: "1em" }}>
      <path d="M4 12h15m0 0-5.6-5.6M19 12l-5.6 5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="5" width="18" height="14" rx="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="m4 7 7.3 5.4a1.2 1.2 0 0 0 1.4 0L20 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg {...base}>
      <path d="M9 15 20 4M20 4h-6m6 0v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
